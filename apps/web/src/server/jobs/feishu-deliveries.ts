import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { logger } from '@/server/logger';
import { getFeishuTransport } from '@/server/feishu/transport';
import type { FeishuTransport, OutboundMessage } from '@/server/feishu/transport-types';
import { buildFeishuAnswerCard } from '@/server/feishu/answer-card';
import { feishuCopy } from '@/server/feishu/copy';
import {
  createPendingAnswerDeliveries,
  getProcessingReaction,
  reconstructAnswer,
} from '@/server/services/feishu-notifications';

/** Exponential backoff (ms) indexed by prior attempt count; caps at 5 attempts. */
const BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60 * 1000;
const WORKER_ID = `web-${process.pid}-${randomUUID().slice(0, 8)}`;

/**
 * Maximum age (hours) for which we still send the "I don't have an answer"
 * fallback when `reconstructAnswer` cannot recover the answer. Past this
 * threshold we silently `markDelivered` instead — sending fallback text hours
 * late is worse than sending nothing at all (the user has moved on, the
 * reaction emoji has already been cleaned up by Feishu, etc.). 24h covers
 * the full default delivery retention window with a comfortable margin and
 * matches the worst-case retry budget (~35min across 5 attempts) by orders
 * of magnitude.
 */
const STALE_FALLBACK_HOURS = 24;

type DeliveryRow = typeof schema.feishuNotificationDeliveries.$inferSelect;

/**
 * Reset deliveries whose worker lease expired (crash/restart mid-send) back to a
 * retryable state so another tick re-claims them. Runs on boot and each tick —
 * the restart-recovery half of FR-021/SC-005.
 */
export async function recoverStaleFeishuDeliveries(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(schema.feishuNotificationDeliveries)
    .set({ status: 'retry', claimedBy: null, claimedAt: null, leaseExpiresAt: null })
    .where(
      and(
        eq(schema.feishuNotificationDeliveries.status, 'running'),
        lt(schema.feishuNotificationDeliveries.leaseExpiresAt, now),
      ),
    )
    .returning({ id: schema.feishuNotificationDeliveries.id });
  return rows.length;
}

/** Mark still-pending deliveries past their retention/expiry window as expired. */
export async function expireOverdueDeliveries(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(schema.feishuNotificationDeliveries)
    .set({ status: 'expired' })
    .where(
      and(
        inArray(schema.feishuNotificationDeliveries.status, ['queued', 'retry']),
        lt(schema.feishuNotificationDeliveries.expiresAt, now),
      ),
    )
    .returning({ id: schema.feishuNotificationDeliveries.id });
  return rows.length;
}

/**
 * Atomically claim a bounded batch of due deliveries for this worker. Uses
 * `FOR UPDATE SKIP LOCKED` so concurrent workers never claim the same row.
 */
export async function claimDueDeliveries(now: Date, limit = 20): Promise<DeliveryRow[]> {
  const leaseExpires = new Date(now.getTime() + LEASE_MS);
  const table = schema.feishuNotificationDeliveries;
  // Single atomic UPDATE; the FOR UPDATE SKIP LOCKED subquery lets concurrent
  // workers claim disjoint batches. `.returning()` yields camelCase-mapped rows.
  return db
    .update(table)
    .set({ status: 'running', claimedBy: WORKER_ID, claimedAt: now, leaseExpiresAt: leaseExpires })
    .where(
      sql`${table.id} IN (
        SELECT id FROM feishu_notification_deliveries
        WHERE status IN ('queued', 'retry')
          AND available_at <= ${sql.param(now, table.availableAt)}
          AND expires_at > ${sql.param(now, table.expiresAt)}
        ORDER BY available_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )`,
    )
    .returning();
}

async function markDelivered(id: string, now: Date): Promise<void> {
  await db
    .update(schema.feishuNotificationDeliveries)
    .set({
      status: 'delivered',
      deliveredAt: now,
      claimedBy: null,
      leaseExpiresAt: null,
      lastError: null,
    })
    .where(eq(schema.feishuNotificationDeliveries.id, id));
}

async function markBlocked(id: string, reason: string): Promise<void> {
  await db
    .update(schema.feishuNotificationDeliveries)
    .set({ status: 'blocked', claimedBy: null, leaseExpiresAt: null, lastError: reason })
    .where(eq(schema.feishuNotificationDeliveries.id, id));
}

async function clearProcessingReaction(transport: FeishuTransport, actionId: string): Promise<void> {
  const reaction = await getProcessingReaction(actionId);
  if (!reaction) return;
  try {
    await transport.removeProcessingReaction(reaction);
  } catch (error) {
    logger.warn('feishu processing reaction could not be removed', {
      actionId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** Schedule a retry with exponential backoff, or mark failed after 5 attempts. */
async function scheduleRetryOrFail(row: DeliveryRow, error: string, now: Date): Promise<void> {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db
      .update(schema.feishuNotificationDeliveries)
      .set({ status: 'failed', attempts, claimedBy: null, leaseExpiresAt: null, lastError: error })
      .where(eq(schema.feishuNotificationDeliveries.id, row.id));
    return;
  }
  const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]!;
  await db
    .update(schema.feishuNotificationDeliveries)
    .set({
      status: 'retry',
      attempts,
      availableAt: new Date(now.getTime() + backoff),
      claimedBy: null,
      leaseExpiresAt: null,
      lastError: error,
    })
    .where(eq(schema.feishuNotificationDeliveries.id, row.id));
}

/**
 * Render an answer card for a delivery from its terminal action state. Returns
 * `{ kind: 'skip' }` when the action is too old AND `reconstructAnswer` cannot
 * recover the answer — in that case `processDelivery` silently `markDelivered`s
 * the row instead of sending a stale "I don't have an answer" message. Real
 * answers (`completed` with text) and `insufficient_evidence` always go through.
 */
type RenderResult =
  | { kind: 'message'; payload: Pick<OutboundMessage, 'card' | 'text'> }
  | { kind: 'skip' };

async function renderAnswer(actionId: string, now: Date): Promise<RenderResult> {
  const answer = await reconstructAnswer(actionId);
  if (answer.status === 'insufficient_evidence') {
    return { kind: 'message', payload: { text: feishuCopy.insufficientEvidence() } };
  }
  if (answer.status === 'unavailable' || !answer.text) {
    if (await isActionTooStale(actionId, now)) return { kind: 'skip' };
    return { kind: 'message', payload: { text: feishuCopy.unavailable() } };
  }
  return { kind: 'message', payload: { card: buildFeishuAnswerCard(answer.text, answer.citations) } };
}

/**
 * True when the action's `queuedAt` is older than `STALE_FALLBACK_HOURS`, OR
 * the action no longer exists (defensive: orphaned deliveries can't render,
 * and treating them as stale lets the worker clean them up without sending).
 */
async function isActionTooStale(actionId: string, now: Date): Promise<boolean> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { queuedAt: true },
  });
  if (!action) return true;
  const ageMs = now.getTime() - action.queuedAt.getTime();
  return ageMs > STALE_FALLBACK_HOURS * 60 * 60 * 1000;
}

/**
 * Re-verify the Feishu bot session backing the delivery's action is still
 * `active` at send time. `createPendingAnswerDeliveries` already filters on
 * `state = 'active'` at creation, but a session can be `reset` (user-driven)
 * or `expired` (TTL) between then and `claimDueDeliveries`. Catching it here
 * turns those rows into `blocked` with a clear reason instead of letting the
 * transport push a message into a defunct chat.
 *
 * The join mirrors `createPendingAnswerDeliveries`: a session is linked via
 * either the direct FK `feishuBotSessions.aiActionId` (current turn) or the
 * action's `requestMetadata.feishuSessionId` (follow-up turn in an existing
 * session — see the "earlier completed turn" delivery test).
 */
async function assertActiveFeishuSession(actionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.feishuBotSessions.id })
    .from(schema.feishuBotSessions)
    .innerJoin(
      schema.aiActions,
      and(
        eq(schema.aiActions.id, actionId),
        or(
          eq(schema.aiActions.id, schema.feishuBotSessions.aiActionId),
          sql`${schema.aiActions.requestMetadata} ->> 'feishuSessionId' = ${schema.feishuBotSessions.id}::text`,
        ),
      ),
    )
    .where(eq(schema.feishuBotSessions.state, 'active'))
    .limit(1);
  return rows.length > 0;
}

async function processDelivery(
  transport: FeishuTransport,
  row: DeliveryRow,
  now: Date,
): Promise<void> {
  // Answer delivery (Q&A). Notification deliveries (event_id) are handled in US3.
  if (!row.aiActionId) return;

  // Re-check the recipient binding + user immediately before sending.
  if (row.recipientBindingId) {
    const binding = await db.query.feishuBindings.findFirst({
      where: and(
        eq(schema.feishuBindings.id, row.recipientBindingId),
        eq(schema.feishuBindings.status, 'active'),
      ),
      with: { user: { columns: { status: true } } },
    });
    if (!binding || binding.user?.status !== 'active') {
      await markBlocked(row.id, 'binding_revoked_or_user_inactive');
      return;
    }
  }
  const openId = row.targetOpenId;
  if (!openId) {
    await markBlocked(row.id, 'no_target');
    return;
  }

  // Secondary session-state recheck: covers `reset`/`expired` between
  // createPendingAnswerDeliveries and claimDueDeliveries. Skips here are
  // surfaced as `blocked` so the operator dashboard can distinguish them
  // from transport failures.
  if (!(await assertActiveFeishuSession(row.aiActionId))) {
    await markBlocked(row.id, 'session_inactive');
    return;
  }

  const rendered = await renderAnswer(row.aiActionId, now);
  if (rendered.kind === 'skip') {
    // Stale + unrecoverable: drop silently. Still clean up the reaction
    // (so Feishu stops showing the processing emoji) and mark delivered so
    // the row doesn't churn through the retry loop.
    await clearProcessingReaction(transport, row.aiActionId);
    await markDelivered(row.id, now);
    return;
  }

  try {
    await transport.sendMessage({
      target: { type: 'direct', openId },
      ...rendered.payload,
      requestUuid: row.id, // deterministic idempotency key
    });
    await clearProcessingReaction(transport, row.aiActionId);
    await markDelivered(row.id, now);
  } catch (error) {
    await scheduleRetryOrFail(row, error instanceof Error ? error.message : 'send_failed', now);
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await clearProcessingReaction(transport, row.aiActionId);
    }
  }
}

/**
 * Durable delivery worker tick: recover stale claims, expire overdue rows,
 * reconcile terminal Q&A actions into answer deliveries, then claim and send a
 * bounded batch. No-ops quickly when the integration is unconfigured.
 */
export async function runFeishuDeliveries(
  now: Date = new Date(),
  transportOverride?: FeishuTransport,
): Promise<void> {
  await recoverStaleFeishuDeliveries(now);
  await expireOverdueDeliveries(now);
  await createPendingAnswerDeliveries(now);

  const transport = transportOverride ?? (await getFeishuTransport());
  if (!transport) return;

  const claimed = await claimDueDeliveries(now, 20);
  for (const row of claimed) {
    try {
      await processDelivery(transport, row, now);
    } catch (error) {
      logger.error('feishu delivery failed', {
        deliveryId: row.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
