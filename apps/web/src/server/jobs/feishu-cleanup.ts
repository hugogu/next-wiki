import { and, inArray, lt } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * Periodic Feishu retention cleanup: drop expired inbox dedupe rows, spent/expired
 * binding tokens, and terminal deliveries past their retention window. Aggregate
 * subscription health lives on the subscription row and is retained separately.
 */
export async function runFeishuCleanup(now: Date = new Date()): Promise<void> {
  await db
    .delete(schema.feishuInboxEvents)
    .where(lt(schema.feishuInboxEvents.expiresAt, now));

  await db
    .delete(schema.feishuBindingTokens)
    .where(lt(schema.feishuBindingTokens.expiresAt, now));

  await db
    .delete(schema.feishuNotificationDeliveries)
    .where(
      and(
        inArray(schema.feishuNotificationDeliveries.status, [
          'delivered',
          'failed',
          'expired',
          'blocked',
        ]),
        lt(schema.feishuNotificationDeliveries.expiresAt, now),
      ),
    );
}
