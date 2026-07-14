import { and, eq, gte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/** Minimum retention for inbox dedupe records (Feishu retries up to ~6h). */
const INBOX_TTL_HOURS = 24;

export type InboxRecordInput = {
  tenantKey: string;
  eventType: string;
  /** Feishu `message_id` for message events, else `event_id`. */
  sourceEventId: string;
  openId?: string | null;
  chatId?: string | null;
  correlationId?: string;
};

export type InboxRecordResult = {
  /** True when this exact event was already recorded (at-least-once duplicate). */
  duplicate: boolean;
  correlationId: string;
};

/**
 * Durable receive-side idempotency. Inserts the dedupe row for a freshly
 * received event; a duplicate (same tenant + type + source id) is a no-op and
 * reported as `duplicate: true` so the caller acknowledges without reprocessing.
 */
export async function recordInbound(input: InboxRecordInput): Promise<InboxRecordResult> {
  const correlationId = input.correlationId ?? randomUUID();
  const expiresAt = new Date(Date.now() + INBOX_TTL_HOURS * 60 * 60 * 1000);
  const inserted = await db
    .insert(schema.feishuInboxEvents)
    .values({
      tenantKey: input.tenantKey,
      eventType: input.eventType,
      sourceEventId: input.sourceEventId,
      openId: input.openId ?? null,
      chatId: input.chatId ?? null,
      correlationId,
      expiresAt,
    })
    .onConflictDoNothing({
      target: [
        schema.feishuInboxEvents.tenantKey,
        schema.feishuInboxEvents.eventType,
        schema.feishuInboxEvents.sourceEventId,
      ],
    })
    .returning({ correlationId: schema.feishuInboxEvents.correlationId });

  if (inserted.length === 0) {
    // Return the original correlation id so a duplicate traces to the first event.
    const existing = await db.query.feishuInboxEvents.findFirst({
      where: and(
        eq(schema.feishuInboxEvents.tenantKey, input.tenantKey),
        eq(schema.feishuInboxEvents.eventType, input.eventType),
        eq(schema.feishuInboxEvents.sourceEventId, input.sourceEventId),
      ),
      columns: { correlationId: true },
    });
    return { duplicate: true, correlationId: existing?.correlationId ?? correlationId };
  }
  return { duplicate: false, correlationId };
}

export async function markProcessed(correlationId: string): Promise<void> {
  await db
    .update(schema.feishuInboxEvents)
    .set({ status: 'processed' })
    .where(eq(schema.feishuInboxEvents.correlationId, correlationId));
}

export async function markRejected(correlationId: string): Promise<void> {
  await db
    .update(schema.feishuInboxEvents)
    .set({ status: 'rejected' })
    .where(eq(schema.feishuInboxEvents.correlationId, correlationId));
}

type RateScope = { openId?: string | null; chatId?: string | null };

/**
 * Count inbound message events within the trailing minute, per Feishu identity
 * and per chat. Used to enforce the admin-configurable per-user/per-chat limits
 * so one noisy chat cannot starve others.
 */
export async function recentCounts(scope: RateScope): Promise<{ user: number; chat: number }> {
  const since = new Date(Date.now() - 60 * 1000);
  const [userRow] = scope.openId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.feishuInboxEvents)
        .where(
          and(
            eq(schema.feishuInboxEvents.openId, scope.openId),
            gte(schema.feishuInboxEvents.receivedAt, since),
          ),
        )
    : [{ n: 0 }];
  const [chatRow] = scope.chatId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.feishuInboxEvents)
        .where(
          and(
            eq(schema.feishuInboxEvents.chatId, scope.chatId),
            gte(schema.feishuInboxEvents.receivedAt, since),
          ),
        )
    : [{ n: 0 }];
  return { user: userRow?.n ?? 0, chat: chatRow?.n ?? 0 };
}

/**
 * Whether a new inbound message from `openId` in `chatId` is within both the
 * per-user and per-chat limits. The current message's own inbox row is expected
 * to be recorded already, so limits are inclusive.
 */
export async function isWithinRateLimit(
  scope: RateScope,
  limits: { userLimit: number; chatLimit: number },
): Promise<boolean> {
  const counts = await recentCounts(scope);
  return counts.user <= limits.userLimit && counts.chat <= limits.chatLimit;
}

/** Build the durable dedupe key from tenant + event type + source id. */
export function inboxKey(tenantKey: string, eventType: string, sourceEventId: string): string {
  return `${tenantKey}:${eventType}:${sourceEventId}`;
}
