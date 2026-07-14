import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * Foundation-level integration coverage for the Feishu schema constraints that
 * the service unit tests do not exercise directly: the partial unique indexes on
 * active bindings and on answer deliveries, and inbox dedupe at the DB level.
 */

async function makeUser(email: string) {
  const [u] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH' })
    .returning();
  return u!;
}

async function makeAiAction(actorUserId: string) {
  const [a] = await db
    .insert(schema.aiActions)
    .values({
      feature: 'wiki_question',
      actorUserId,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  return a!;
}

async function cleanup() {
  await db.delete(schema.feishuNotificationDeliveries);
  await db.delete(schema.feishuInboxEvents);
  await db.delete(schema.feishuBindings);
  await db.delete(schema.aiActions);
  await db.delete(schema.users);
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('feishu foundation schema', () => {
  it('allows only one active binding per open_id but keeps revoked history', async () => {
    const user = await makeUser('found-a@example.com');
    await db
      .insert(schema.feishuBindings)
      .values({ userId: user.id, openId: 'ou_dup', status: 'active' });

    // A second active binding for the same open_id violates the partial unique.
    await expect(
      db
        .insert(schema.feishuBindings)
        .values({ userId: user.id, openId: 'ou_dup', status: 'active' }),
    ).rejects.toBeTruthy();

    // Revoking the first frees the open_id for a new active binding.
    await db
      .update(schema.feishuBindings)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(schema.feishuBindings.openId, 'ou_dup'));
    await expect(
      db
        .insert(schema.feishuBindings)
        .values({ userId: user.id, openId: 'ou_dup', status: 'active' }),
    ).resolves.toBeTruthy();

    const rows = await db.select().from(schema.feishuBindings);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'revoked')).toHaveLength(1);
  });

  it('enforces one answer delivery per ai_action', async () => {
    const user = await makeUser('found-b@example.com');
    const action = await makeAiAction(user.id);
    await db.insert(schema.feishuNotificationDeliveries).values({
      aiActionId: action.id,
      targetOpenId: 'ou_x',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await expect(
      db.insert(schema.feishuNotificationDeliveries).values({
        aiActionId: action.id,
        targetOpenId: 'ou_x',
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toBeTruthy();
  });

  it('deduplicates inbox events on the tenant/type/source triple', async () => {
    const values = {
      tenantKey: 't',
      eventType: 'im.message.receive_v1',
      sourceEventId: 'om_dup',
      correlationId: 'c1',
      expiresAt: new Date(Date.now() + 3_600_000),
    };
    await db.insert(schema.feishuInboxEvents).values(values);
    const dup = await db
      .insert(schema.feishuInboxEvents)
      .values({ ...values, correlationId: 'c2' })
      .onConflictDoNothing({
        target: [
          schema.feishuInboxEvents.tenantKey,
          schema.feishuInboxEvents.eventType,
          schema.feishuInboxEvents.sourceEventId,
        ],
      })
      .returning();
    expect(dup).toHaveLength(0);
    const rows = await db.select().from(schema.feishuInboxEvents);
    expect(rows).toHaveLength(1);
  });
});
