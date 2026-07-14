import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';

const createWikiQuestion = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/ai-question', () => ({ createWikiQuestion }));

import { handleInboundMessage } from './feishu-delegation';

async function makeUser(email: string, role: 'admin' | 'editor' | 'reader' = 'reader') {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role })
    .returning();
  return user!;
}

async function makeBinding(userId: string, openId: string) {
  const [binding] = await db
    .insert(schema.feishuBindings)
    .values({ userId, openId, status: 'active' })
    .returning();
  return binding!;
}

async function makeAction(userId: string) {
  const [action] = await db
    .insert(schema.aiActions)
    .values({
      feature: 'wiki_question',
      actorUserId: userId,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  return action!;
}

async function cleanup() {
  await db.delete(schema.apiAuditEntries);
  await db.delete(schema.feishuNotificationDeliveries);
  await db.delete(schema.feishuBotSessions);
  await db.delete(schema.feishuBindings);
  await db.delete(schema.aiActions);
  await db.delete(schema.users);
}

beforeEach(async () => {
  await cleanup();
  createWikiQuestion.mockReset();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('Feishu in-process delegation', () => {
  it('derives the effective user only from the active binding and records safe Feishu attribution', async () => {
    const boundUser = await makeUser('feishu-bound@example.com', 'editor');
    await makeBinding(boundUser.id, 'ou_bound');
    const action = await makeAction(boundUser.id);
    createWikiQuestion.mockResolvedValue({ id: action.id });

    const result = await handleInboundMessage({
      eventKey: 'tenant:message:om_bound',
      messageId: 'om_bound',
      openId: 'ou_bound',
      chatId: 'oc_group',
      chatType: 'group',
      mentionedBot: true,
      text: 'Where is the deployment guide?',
      correlationId: 'corr-bound',
    });

    expect(result).toMatchObject({
      disposition: 'question_queued',
      aiActionId: action.id,
      responseTarget: { type: 'direct', openId: 'ou_bound' },
    });
    expect(createWikiQuestion).toHaveBeenCalledWith(
      { actor: { kind: 'user', userId: boundUser.id, role: 'editor' } },
      expect.objectContaining({
        mode: 'retrieval',
        requestMetadata: expect.objectContaining({ origin: 'feishu', correlationId: 'corr-bound' }),
      }),
    );

    const [session] = await db.select().from(schema.feishuBotSessions);
    expect(session).toMatchObject({
      bindingId: expect.any(String),
      chatId: 'oc_group',
      aiActionId: action.id,
    });
    const [audit] = await db.select().from(schema.apiAuditEntries);
    expect(audit).toMatchObject({
      userId: boundUser.id,
      origin: 'feishu',
      externalCorrelationId: 'corr-bound',
      authStatus: 'authenticated',
    });
  });

  it('returns an explicit safe reply when the bound user cannot use AI', async () => {
    const user = await makeUser('feishu-disabled@example.com');
    await makeBinding(user.id, 'ou_disabled');
    createWikiQuestion.mockRejectedValue(new DomainError('AI_DISABLED', 'disabled'));

    await expect(
      handleInboundMessage({
        eventKey: 'tenant:message:om_disabled',
        messageId: 'om_disabled',
        openId: 'ou_disabled',
        chatId: 'oc_direct',
        chatType: 'p2p',
        mentionedBot: false,
        text: 'Can you help?',
        correlationId: 'corr-disabled',
      }),
    ).resolves.toMatchObject({
      disposition: 'reply',
      responseTarget: { type: 'direct', openId: 'ou_disabled' },
      text: expect.stringMatching(/AI question answering is not enabled/i),
    });
  });

  it('resets only the bound user session in the current chat', async () => {
    const firstUser = await makeUser('feishu-reset-a@example.com');
    const secondUser = await makeUser('feishu-reset-b@example.com');
    const firstBinding = await makeBinding(firstUser.id, 'ou_reset_a');
    const secondBinding = await makeBinding(secondUser.id, 'ou_reset_b');
    const firstAction = await makeAction(firstUser.id);
    const secondAction = await makeAction(secondUser.id);
    const expiresAt = new Date(Date.now() + 3_600_000);
    await db.insert(schema.feishuBotSessions).values([
      { bindingId: firstBinding.id, chatId: 'oc_shared', aiActionId: firstAction.id, expiresAt },
      { bindingId: secondBinding.id, chatId: 'oc_shared', aiActionId: secondAction.id, expiresAt },
    ]);

    const result = await handleInboundMessage({
      eventKey: 'tenant:message:om_reset',
      messageId: 'om_reset',
      openId: 'ou_reset_a',
      chatId: 'oc_shared',
      chatType: 'group',
      mentionedBot: true,
      text: '/reset',
      correlationId: 'corr-reset',
    });

    expect(result).toMatchObject({
      disposition: 'reply',
      text: expect.stringMatching(/new conversation/i),
    });
    const sessions = await db
      .select()
      .from(schema.feishuBotSessions)
      .orderBy(schema.feishuBotSessions.bindingId);
    expect(sessions.find((session) => session.bindingId === firstBinding.id)?.state).toBe('reset');
    expect(sessions.find((session) => session.bindingId === secondBinding.id)?.state).toBe(
      'active',
    );
    expect(createWikiQuestion).not.toHaveBeenCalled();
  });
});
