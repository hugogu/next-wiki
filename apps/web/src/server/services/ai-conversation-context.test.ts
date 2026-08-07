import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import {
  buildConversationTurn,
  isBareToolProtocol,
  loadWebConversationContext,
  mergeConversationContext,
} from './ai-conversation-context';

describe('Wiki AI durable conversation context', () => {
  beforeEach(async () => {
    await clearAiData();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('turns a failed prior action into retry context instead of dropping it', () => {
    expect(buildConversationTurn({
      question: '写一篇读书笔记并保存到 Wiki。',
      status: 'failed',
      error: 'The AI provider repeatedly returned an invalid tool call.',
    })).toEqual({
      question: '写一篇读书笔记并保存到 Wiki。',
      answer: expect.stringContaining('did not complete'),
    });
  });

  it('does not treat an unfenced tool protocol as a completed answer', () => {
    const rawProtocol = 'tool_calls:\n  - tool: search_wiki\n    arguments: {}';
    expect(isBareToolProtocol(rawProtocol)).toBe(true);
    expect(buildConversationTurn({
      question: '创建笔记。',
      answer: rawProtocol,
      status: 'completed',
    })?.answer).toContain('no usable final answer');
  });

  it('keeps durable history ahead of browser state and caps the prompt context', () => {
    const persisted = Array.from({ length: 6 }, (_, index) => ({
      question: `server-${index}`,
      answer: `answer-${index}`,
    }));
    const client = [{ question: 'browser-pending', answer: 'pending answer' }];

    expect(mergeConversationContext(persisted, client)).toEqual([
      ...persisted.slice(1),
      client[0],
    ]);
  });

  it('rebuilds a failed earlier web turn from action events after a browser reload', async () => {
    const userId = await createAiTestUser('editor');
    const sessionId = randomUUID();
    const queuedAt = new Date('2026-08-07T12:00:00.000Z');
    try {
      const [action] = await db
        .insert(schema.aiActions)
        .values({
          feature: 'wiki_question',
          status: 'failed',
          actorUserId: userId,
          requestMetadata: { origin: 'web', webSessionId: sessionId },
          errorMessage: 'The AI provider repeatedly returned an invalid tool call.',
          queuedAt,
          expiresAt: new Date('2026-08-08T12:00:00.000Z'),
        })
        .returning({ id: schema.aiActions.id });
      await db.insert(schema.aiActionEvents).values([
        {
          actionId: action!.id,
          type: 'question',
          payload: { text: '写一篇《股票作手回忆录》的读书笔记并保存到 Wiki。' },
          expiresAt: new Date('2026-08-08T12:00:00.000Z'),
        },
        {
          actionId: action!.id,
          type: 'error',
          payload: { message: 'The AI provider repeatedly returned an invalid tool call.' },
          expiresAt: new Date('2026-08-08T12:00:00.000Z'),
        },
      ]);

      await expect(loadWebConversationContext({
        actorUserId: userId,
        queuedAt: new Date('2026-08-07T12:01:00.000Z'),
        requestMetadata: { origin: 'web', webSessionId: sessionId },
      })).resolves.toEqual([
        {
          question: '写一篇《股票作手回忆录》的读书笔记并保存到 Wiki。',
          answer: expect.stringContaining('did not complete'),
        },
      ]);
    } finally {
      await clearAiData();
      await removeAiTestUser(userId);
    }
  });
});
