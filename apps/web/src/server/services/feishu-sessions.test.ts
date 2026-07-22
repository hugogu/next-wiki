import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  getActiveSession,
  getConversationContext,
  SESSION_DEFAULT_MINUTES,
  validateSessionMinutes,
} from './feishu-sessions';

async function makeUser(email: string) {
  const [user] = await db.insert(schema.users).values({ email, passwordHash: 'HASH' }).returning();
  return user!;
}

async function makeAction(
  userId: string,
  requestMetadata: Record<string, unknown>,
  feature: 'wiki_question' = 'wiki_question',
  queuedAt = new Date(),
) {
  const [action] = await db
    .insert(schema.aiActions)
    .values({
      feature,
      actorUserId: userId,
      requestMetadata,
      queuedAt,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
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

describe('Feishu sessions', () => {
  it('rebuilds only the bound user’s recent turns for a server-side session', async () => {
    const user = await makeUser('session-owner@example.com');
    const otherUser = await makeUser('session-other@example.com');
    const [binding] = await db
      .insert(schema.feishuBindings)
      .values({ userId: user.id, openId: 'ou_session', status: 'active' })
      .returning();
    const [session] = await db
      .insert(schema.feishuBotSessions)
      .values({
        bindingId: binding!.id,
        chatId: 'oc_session',
        state: 'active',
        expiresAt: new Date(Date.now() + SESSION_DEFAULT_MINUTES * 60 * 1000),
      })
      .returning();
    const first = await makeAction(user.id, { feishuSessionId: session!.id }, 'wiki_question', new Date('2026-07-22T00:00:00Z'));
    const toolChat = await makeAction(user.id, { feishuSessionId: session!.id }, 'wiki_question', new Date('2026-07-22T00:01:00Z'));
    const other = await makeAction(otherUser.id, { feishuSessionId: session!.id }, 'wiki_question', new Date('2026-07-22T00:02:00Z'));
    const expiresAt = new Date(Date.now() + 3_600_000);
    await db.insert(schema.aiActionEvents).values([
      {
        actionId: first.id,
        type: 'question',
        payload: { text: 'What is the first step?' },
        expiresAt,
      },
      {
        actionId: first.id,
        type: 'text_delta',
        payload: { text: 'Open the settings page.' },
        expiresAt,
      },
      {
        actionId: other.id,
        type: 'question',
        payload: { text: 'Secret other question' },
        expiresAt,
      },
      {
        actionId: other.id,
        type: 'text_delta',
        payload: { text: 'Secret other answer' },
        expiresAt,
      },
      {
        actionId: toolChat.id,
        type: 'question',
        payload: { text: 'Write the above into a page.' },
        expiresAt,
      },
      {
        actionId: toolChat.id,
        type: 'text_delta',
        payload: { text: 'Created a draft page.' },
        expiresAt,
      },
    ]);

    await db
      .update(schema.feishuBotSessions)
      .set({ aiActionId: first.id })
      .where(eq(schema.feishuBotSessions.id, session!.id));

    await expect(getConversationContext(session!.id, user.id)).resolves.toEqual([
      { question: 'What is the first step?', answer: 'Open the settings page.' },
      { question: 'Write the above into a page.', answer: 'Created a draft page.' },
    ]);
  });

  it('expires stale sessions and validates the supported window range', async () => {
    const user = await makeUser('session-expired@example.com');
    const [binding] = await db
      .insert(schema.feishuBindings)
      .values({ userId: user.id, openId: 'ou_expired', status: 'active' })
      .returning();
    await db.insert(schema.feishuBotSessions).values({
      bindingId: binding!.id,
      chatId: 'oc_expired',
      state: 'active',
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(getActiveSession(binding!.id, 'oc_expired')).resolves.toBeNull();
    const [row] = await db.select().from(schema.feishuBotSessions);
    expect(row!.state).toBe('expired');
    expect(validateSessionMinutes(5)).toBe(5);
    expect(validateSessionMinutes(240)).toBe(240);
    expect(() => validateSessionMinutes(4)).toThrow(/between 5 and 240/);
  });
});
