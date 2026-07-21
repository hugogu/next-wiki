import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { attachActionToSession, getOrCreateActiveSession } from './feishu-sessions';

/**
 * 025 (US3): `feishuBotSessions` is a thin Feishu-specific wrapper — it
 * tracks lifecycle state for a (binding, chat) pair and points at the latest
 * `ai_action_id`; it never grows a parallel conversation timeline. These
 * tests enforce that contract at the schema and behavior level so a future
 * change cannot silently reintroduce a second history store (see the header
 * comment on feishu-sessions.ts and plan.md D3/D5).
 */
async function makeUser(email: string) {
  const [user] = await db.insert(schema.users).values({ email, passwordHash: 'HASH' }).returning();
  return user!;
}

async function makeAction(userId: string) {
  const [action] = await db
    .insert(schema.aiActions)
    .values({ feature: 'wiki_question', actorUserId: userId, expiresAt: new Date(Date.now() + 3_600_000) })
    .returning();
  return action!;
}

async function cleanup() {
  await db.delete(schema.feishuNotificationDeliveries);
  await db.delete(schema.feishuBotSessions);
  await db.delete(schema.feishuBindings);
  await db.delete(schema.aiActionEvents);
  await db.delete(schema.aiActions);
  await db.delete(schema.users);
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('feishuBotSessions — thin wrapper contract (025, US3)', () => {
  it('the schema carries no conversation-timeline columns', () => {
    const columnNames = Object.keys(schema.feishuBotSessions);
    for (const forbidden of ['question', 'answer', 'citations', 'errorMessage', 'status']) {
      expect(columnNames).not.toContain(forbidden);
    }
    expect(columnNames).toEqual(
      expect.arrayContaining(['id', 'bindingId', 'chatId', 'aiActionId', 'state', 'lastActivityAt', 'expiresAt']),
    );
  });

  it('getOrCreateActiveSession creates exactly one row per (binding, chat)', async () => {
    const user = await makeUser('wrapper-owner@example.com');
    const [binding] = await db
      .insert(schema.feishuBindings)
      .values({ userId: user.id, openId: 'ou_wrapper', status: 'active' })
      .returning();

    const first = await getOrCreateActiveSession(binding!.id, 'oc_wrapper');
    const second = await getOrCreateActiveSession(binding!.id, 'oc_wrapper');
    expect(second.id).toBe(first.id);

    const rows = await db
      .select()
      .from(schema.feishuBotSessions)
      .where(and(eq(schema.feishuBotSessions.bindingId, binding!.id), eq(schema.feishuBotSessions.chatId, 'oc_wrapper')));
    expect(rows).toHaveLength(1);
  });

  it('attachActionToSession updates only ai_action_id, last_activity_at, expires_at, and state stays active', async () => {
    const user = await makeUser('wrapper-attach@example.com');
    const [binding] = await db
      .insert(schema.feishuBindings)
      .values({ userId: user.id, openId: 'ou_attach', status: 'active' })
      .returning();
    const session = await getOrCreateActiveSession(binding!.id, 'oc_attach');
    const firstAction = await makeAction(user.id);
    const secondAction = await makeAction(user.id);

    const afterFirst = await attachActionToSession(session.id, firstAction.id);
    expect(afterFirst).toMatchObject({ id: session.id, aiActionId: firstAction.id, state: 'active' });

    const afterSecond = await attachActionToSession(session.id, secondAction.id);
    expect(afterSecond).toMatchObject({ id: session.id, aiActionId: secondAction.id, state: 'active' });
    expect(afterSecond.lastActivityAt.getTime()).toBeGreaterThanOrEqual(afterFirst.lastActivityAt.getTime());

    // Still exactly one row for this (binding, chat) — each turn swaps the
    // pointer in place rather than appending a new session/timeline row.
    const rows = await db.select().from(schema.feishuBotSessions).where(eq(schema.feishuBotSessions.bindingId, binding!.id));
    expect(rows).toHaveLength(1);
  });

  it('a duplicate inbound event for the same (binding, chat) upserts the same row, never a second one', async () => {
    const user = await makeUser('wrapper-duplicate@example.com');
    const [binding] = await db
      .insert(schema.feishuBindings)
      .values({ userId: user.id, openId: 'ou_duplicate', status: 'active' })
      .returning();

    // Simulates two overlapping inbound webhook deliveries for the same chat
    // racing to open/attach a session — both must converge on one row.
    const [a, b] = await Promise.all([
      getOrCreateActiveSession(binding!.id, 'oc_duplicate'),
      getOrCreateActiveSession(binding!.id, 'oc_duplicate'),
    ]);
    expect(a.id).toBe(b.id);

    const action = await makeAction(user.id);
    await attachActionToSession(a.id, action.id);

    const rows = await db.select().from(schema.feishuBotSessions).where(eq(schema.feishuBotSessions.bindingId, binding!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ aiActionId: action.id, state: 'active' });
  });
});
