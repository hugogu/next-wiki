import { and, eq, inArray, lt, sql } from 'drizzle-orm';
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

/** Render an answer card for a delivery from its terminal action state. */
async function renderAnswer(actionId: string): Promise<Pick<OutboundMessage, 'card' | 'text'>> {
  const answer = await reconstructAnswer(actionId);
  if (answer.status === 'insufficient_evidence') return { text: feishuCopy.insufficientEvidence() };
  if (answer.status === 'unavailable' || !answer.text) return { text: feishuCopy.unavailable() };
  return { card: buildFeishuAnswerCard(answer.text, answer.citations) };
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

  try {
    const message = await renderAnswer(row.aiActionId);
    await transport.sendMessage({
      target: { type: 'direct', openId },
      ...message,
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
