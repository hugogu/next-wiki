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
  opts: { insufficient?: boolean; answer?: string; citations?: unknown[] } = {},
) {
  const [action] = await db
    .insert(schema.aiActions)
    .values({
      feature: 'wiki_question',
      status: 'completed',
      actorUserId: userId,
      resultMetadata: { insufficientEvidence: opts.insufficient ?? false },
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

  it('sends a grounded answer with citation links direct to the asker', async () => {
    const user = await makeUser('deliv-b@example.com');
    const binding = await makeBinding(user.id, 'ou_b');
    const action = await makeCompletedQuestion(user.id, { answer: 'Reset it here.' });
    await makeSession(binding.id, 'oc_b', action.id);

    const transport = new FakeFeishuTransport();
    await runFeishuDeliveries(new Date(), transport);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.target).toEqual({ type: 'direct', openId: 'ou_b' });
    expect(transport.sent[0]?.text).toContain('Reset it here.');
    // The citation link is included (FR-007).
    expect(transport.sent[0]?.text).toContain('/settings/api-keys');
    expect(transport.sent[0]?.requestUuid).toBeTruthy();

    const [row] = await db.select().from(schema.feishuNotificationDeliveries);
    expect(row!.status).toBe('delivered');
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
    expect(transport.sent.map((message) => message.text)).toEqual(
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
});
