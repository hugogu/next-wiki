import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { FakeFeishuTransport } from '@/server/feishu/transport.test-support';
import { runFeishuDeliveries } from '@/server/jobs/feishu-deliveries';
import { createPendingAnswerDeliveries } from '@/server/services/feishu-notifications';

async function makeUser(email: string, status: 'active' | 'disabled' = 'active') {
  const [u] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', status })
    .returning();
  return u!;
}

async function makeBinding(userId: string, openId: string) {
  const [b] = await db
    .insert(schema.feishuBindings)
    .values({ userId, openId, status: 'active' })
    .returning();
  return b!;
}

async function makeCompletedQuestion(
  userId: string,
  opts: {
    insufficient?: boolean;
    answer?: string;
    citations?: unknown[];
    processingReaction?: { messageId: string; reactionId: string };
  } = {},
) {
  const [action] = await db
    .insert(schema.aiActions)
    .values({
      feature: 'wiki_question',
      status: 'completed',
      actorUserId: userId,
      resultMetadata: { insufficientEvidence: opts.insufficient ?? false },
      requestMetadata: opts.processingReaction
        ? { feishuProcessingReaction: opts.processingReaction }
        : {},
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  const eventExpiry = new Date(Date.now() + 3_600_000);
  if (!opts.insufficient) {
    await db.insert(schema.aiActionEvents).values({
      actionId: action!.id,
      type: 'text_delta',
      payload: { text: opts.answer ?? 'Use the API keys page.' },
      expiresAt: eventExpiry,
    });
    await db.insert(schema.aiActionEvents).values({
      actionId: action!.id,
      type: 'citations',
      payload: {
        citations: opts.citations ?? [
          {
            pageId: '00000000-0000-0000-0000-000000000001',
            title: 'API Keys',
            path: 'settings/api-keys',
            locale: 'en',
            revisionId: '00000000-0000-0000-0000-000000000002',
            revisionHash: 'h',
          },
        ],
      },
      expiresAt: eventExpiry,
    });
  }
  return action!;
}

async function makeSession(bindingId: string, chatId: string, actionId: string) {
  const [session] = await db
    .insert(schema.feishuBotSessions)
    .values({
      bindingId,
      chatId,
      aiActionId: actionId,
      state: 'active',
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  return session!;
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

describe('feishu answer delivery worker', () => {
  it('reconciles a completed question into exactly one answer delivery', async () => {
    const user = await makeUser('deliv-a@example.com');
    const binding = await makeBinding(user.id, 'ou_a');
    const action = await makeCompletedQuestion(user.id);
    await makeSession(binding.id, 'oc_a', action.id);

    expect(await createPendingAnswerDeliveries()).toBe(1);
    // Idempotent: a second reconcile creates no duplicate.
    expect(await createPendingAnswerDeliveries()).toBe(0);
    const rows = await db.select().from(schema.feishuNotificationDeliveries);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.aiActionId).toBe(action.id);
  });

  it('sends a grounded answer card with citation links direct to the asker', async () => {
    const user = await makeUser('deliv-b@example.com');
    const binding = await makeBinding(user.id, 'ou_b');
    const action = await makeCompletedQuestion(user.id, { answer: 'Reset it here.' });
    await makeSession(binding.id, 'oc_b', action.id);

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.target).toEqual({ type: 'direct', openId: 'ou_b' });
    expect(transport.sent[0]?.card).toEqual(
      expect.objectContaining({
        elements: expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              tag: 'lark_md',
              content: expect.stringContaining('Reset it here.'),
            }),
          }),
          expect.objectContaining({
            text: expect.objectContaining({
              tag: 'lark_md',
              content: expect.stringContaining('/settings/api-keys'),
            }),
          }),
        ]),
      }),
    );
    expect(transport.sent[0]?.requestUuid).toBeTruthy();

    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('delivered');
  });

  it('removes the processing reaction after delivering an answer', async () => {
    const user = await makeUser('deliv-reaction@example.com');
    const binding = await makeBinding(user.id, 'ou_reaction');
    const action = await makeCompletedQuestion(user.id, {
      processingReaction: { messageId: 'om_question', reactionId: 'reaction_1' },
    });
    await makeSession(binding.id, 'oc_reaction', action.id);

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.removedProcessingReactions).toEqual([
      { messageId: 'om_question', reactionId: 'reaction_1' },
    ]);
  });

  it('delivers an earlier completed turn after a follow-up refreshes the same session', async () => {
    const user = await makeUser('deliv-follow-up@example.com');
    const binding = await makeBinding(user.id, 'ou_follow_up');
    const earlier = await makeCompletedQuestion(user.id, { answer: 'First answer.' });
    const latest = await makeCompletedQuestion(user.id, { answer: 'Second answer.' });
    const session = await makeSession(binding.id, 'oc_follow_up', latest.id);
    await db
      .update(schema.aiActions)
      .set({ requestMetadata: { origin: 'feishu', feishuSessionId: session.id } })
      .where(eq(schema.aiActions.id, earlier.id));

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.sent).toHaveLength(2);
    expect(transport.sent.map((message) => JSON.stringify(message.card))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('First answer.'),
        expect.stringContaining('Second answer.'),
      ]),
    );
  });

  it('sends a safe fallback for an insufficient-evidence answer', async () => {
    const user = await makeUser('deliv-c@example.com');
    const binding = await makeBinding(user.id, 'ou_c');
    const action = await makeCompletedQuestion(user.id, { insufficient: true });
    await makeSession(binding.id, 'oc_c', action.id);

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);
    expect(transport.sent[0]?.text).toMatch(/access|权限/i);
    // No citation/leak.
    expect(transport.sent[0]?.text ?? '').not.toContain('http');
  });

  it('blocks delivery when the recipient user is deactivated before send', async () => {
    const user = await makeUser('deliv-d@example.com');
    const binding = await makeBinding(user.id, 'ou_d');
    const action = await makeCompletedQuestion(user.id);
    await makeSession(binding.id, 'oc_d', action.id);
    await createPendingAnswerDeliveries();
    await db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);
    expect(transport.sent).toHaveLength(0);
    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('blocked');
  });

  it('retries with backoff on a send failure and does not double-send', async () => {
    const user = await makeUser('deliv-e@example.com');
    const binding = await makeBinding(user.id, 'ou_e');
    const action = await makeCompletedQuestion(user.id);
    await makeSession(binding.id, 'oc_e', action.id);

    const transport = new FakeFeishuTransport();
    transport.failSends = true;
    await runFeishuDeliveries(new Date(), transport);

    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('retry');
    expect(row!.attempts).toBe(1);
    expect(row!.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('marks the delivery failed after five attempts', async () => {
    const user = await makeUser('deliv-f@example.com');
    const binding = await makeBinding(user.id, 'ou_f');
    const action = await makeCompletedQuestion(user.id);
    await makeSession(binding.id, 'oc_f', action.id);
    await createPendingAnswerDeliveries();

    const transport = new FakeFeishuTransport();
    transport.failSends = true;
    // Drive five attempts, forcing each retry due immediately.
    for (let i = 0; i < 5; i += 1) {
      await db
        .update(schema.feishuNotificationDeliveries)
        .set({ availableAt: new Date(Date.now() - 1000), status: 'retry' })
        .where(eq(schema.feishuNotificationDeliveries.aiActionId, action.id));
      await runFeishuDeliveries(new Date(), transport);
    }
    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('failed');
    expect(row!.attempts).toBe(5);
  });

  it('does not create a delivery for an expired action', async () => {
    // Expired actions must not enter the delivery pipeline at all: their event
    // data is GC'd, so reconstructAnswer is permanently unavailable and the
    // only outcome would be a stale "I don't have an answer" hours later.
    const user = await makeUser('deliv-expired@example.com');
    const binding = await makeBinding(user.id, 'ou_expired');
    const [action] = await db
      .insert(schema.aiActions)
      .values({
        feature: 'wiki_question',
        status: 'expired',
        actorUserId: user.id,
        resultMetadata: {},
        requestMetadata: {},
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning();
    await makeSession(binding.id, 'oc_expired', action!.id);

    expect(await createPendingAnswerDeliveries()).toBe(0);
    const rows = await db.select().from(schema.feishuNotificationDeliveries);
    expect(rows).toHaveLength(0);
  });

  it('silently marks delivered for a stale unavailable action without sending fallback text', async () => {
    // 25h-old action with no events: reconstructAnswer returns 'completed'
    // with empty text → renderAnswer hits the unavailable branch → staleness
    // check (queuedAt > 24h ago) trips → kind: 'skip'. The transport must see
    // zero messages and the row must land in 'delivered' (not 'blocked' or
    // 'failed') so it doesn't churn through the retry loop.
    const user = await makeUser('deliv-stale@example.com');
    const binding = await makeBinding(user.id, 'ou_stale');
    const [action] = await db
      .insert(schema.aiActions)
      .values({
        feature: 'wiki_question',
        status: 'completed',
        actorUserId: user.id,
        resultMetadata: {},
        requestMetadata: {},
        queuedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning();
    await makeSession(binding.id, 'oc_stale', action!.id);

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.sent).toHaveLength(0);
    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('delivered');
  });

  it('still sends a stale action that has a reconstructable answer', async () => {
    // Negative control for the staleness check: when queuedAt is old but the
    // action has events, reconstructAnswer returns real text → renderAnswer
    // hits the message branch → the card is sent. Staleness only suppresses
    // the fallback, never a real answer.
    const user = await makeUser('deliv-stale-fresh@example.com');
    const binding = await makeBinding(user.id, 'ou_stale_fresh');
    const action = await makeCompletedQuestion(user.id, { answer: 'Old but valid.' });
    await db
      .update(schema.aiActions)
      .set({ queuedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(schema.aiActions.id, action.id));
    await makeSession(binding.id, 'oc_stale_fresh', action.id);

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.sent).toHaveLength(1);
    expect(JSON.stringify(transport.sent[0]?.card)).toContain('Old but valid.');
  });

  it('blocks delivery when the feishu session is reset before send', async () => {
    // createPendingAnswerDeliveries filters on state='active' at creation;
    // this test forces a state flip to 'reset' between create and send to
    // confirm the send-time recheck catches it and marks the row blocked
    // (rather than letting transport push into a defunct chat).
    const user = await makeUser('deliv-reset@example.com');
    const binding = await makeBinding(user.id, 'ou_reset');
    const action = await makeCompletedQuestion(user.id);
    await makeSession(binding.id, 'oc_reset', action.id);
    await createPendingAnswerDeliveries();
    await db
      .update(schema.feishuBotSessions)
      .set({ state: 'reset' })
      .where(eq(schema.feishuBotSessions.aiActionId, action.id));

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.sent).toHaveLength(0);
    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('blocked');
    expect(row!.lastError).toBe('session_inactive');
  });
});
