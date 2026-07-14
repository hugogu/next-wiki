import { and, eq, inArray, lt } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * Reset deliveries whose worker lease expired (crash/restart mid-send) back to a
 * retryable state so another tick re-claims them. Runs on boot and each tick —
 * this is the restart-recovery half of FR-021/SC-005.
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
 * Durable delivery worker tick. Phase 2 provides recovery and expiry; the
 * claim-and-send loop (answers) is added in US2 and (notifications) in US3 by
 * extending this function.
 */
export async function runFeishuDeliveries(): Promise<void> {
  await recoverStaleFeishuDeliveries();
  await expireOverdueDeliveries();
}
