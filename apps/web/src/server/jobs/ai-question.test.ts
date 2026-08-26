import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';

const streamText = vi.hoisted(() => vi.fn());
const embed = vi.hoisted(() => vi.fn());
const cache = vi.hoisted(() => ({
  runWithoutDataCache: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: () => ({ streamText, embed }),
}));
vi.mock('@/server/cache/public-cache', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/server/cache/public-cache')>(),
  runWithoutDataCache: cache.runWithoutDataCache,
}));
vi.mock('@/server/services/ai-admin', async (original) => {
  const actual = await original<typeof import('@/server/services/ai-admin')>();
  return {
    ...actual,
    providerRuntime: vi.fn(async () => ({
      providerId: 'provider',
      name: 'Fixture',
      kind: 'openai_compatible',
      baseUrl: 'https://example.com',
      config: {},
      credentials: { apiKey: 'hidden' },
    })),
  };
});

import { createToolEnabledWikiQuestion, createWikiQuestion } from '@/server/services/ai-question';
import { AiProviderError } from '@/server/ai/types';
import {
  createBatchedReasoningAppender,
  runToolEnabledWikiQuestionAction,
  runWikiQuestionAction,
} from './ai-question';

describe('Wiki question worker', () => {
  let userId: string;
  let pageId: string;
  let revisionId: string;
  let spaceId: string;
  beforeEach(async () => {
    await clearAiData();
    streamText.mockReset();
    embed.mockReset();
    cache.runWithoutDataCache.mockClear();
    streamText.mockImplementation(async function* () {
      yield { type: 'delta', text: 'Grounded answer [S1]' };
      yield { type: 'usage', inputTokens: 10, outputTokens: 4 };
    });
    embed.mockResolvedValue({ vectors: [[1, 0, 0]], usage: { inputTokens: 1 } });
    userId = await createAiTestUser('reader');
    pageId = randomUUID();
    revisionId = randomUUID();
    spaceId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `qa-${spaceId}`, name: 'Q&A' });
    await db.insert(schema.pages).values({
      id: pageId,
      spaceId,
      slug: 'answer',
      path: 'answer',
      title: 'Answer',
      authorId: userId,
      currentPublishedVersionId: revisionId,
      latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId,
      versionNumber: 1,
      contentSource: 'The grounded answer is here.',
      contentHtml: '<p>The grounded answer is here.</p>',
      contentHash: 'hash',
      authorId: userId,
      status: 'published',
      publishedAt: new Date(),
    });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    await db
      .insert(schema.userAiEntitlements)
      .values({ userId, questionAnsweringEnabled: true, updatedBy: userId });
    const [provider] = await db
      .insert(schema.aiProviders)
      .values({
        name: 'Question provider',
        kind: 'openai_compatible',
        baseUrl: 'https://example.com',
        credentialsEncrypted: 'encrypted',
        status: 'healthy',
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    const [textModel] = await db
      .insert(schema.aiModels)
      .values({
        providerId: provider!.id,
        externalId: 'text',
        displayName: 'Text',
        availability: 'available',
        contextWindow: 32_000,
      })
      .returning();
    const [embeddingModel] = await db
      .insert(schema.aiModels)
      .values({
        providerId: provider!.id,
        externalId: 'embed',
        displayName: 'Embed',
        availability: 'available',
        embeddingDimensions: 3,
      })
      .returning();
    await db
      .insert(schema.aiPurposeAssignments)
      .values({ purpose: 'wiki_text', modelId: textModel!.id, updatedBy: userId });
    const [generation] = await db
      .insert(schema.aiIndexGenerations)
      .values({
        modelId: embeddingModel!.id,
        embeddingDimensions: 3,
        chunkerVersion: 'test',
        status: 'ready',
        isActive: true,
      })
      .returning();
    await db.insert(schema.aiKnowledgeChunks).values({
      generationId: generation!.id,
      pageId,
      revisionId,
      chunkIndex: 0,
      contentText: 'The grounded answer is here.',
      contentHash: 'chunk',
      byteCount: 28,
      embedding: [1, 0, 0],
    });
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(userId);
  });

  it.each(['full', 'retrieval'] as const)(
    'streams grounded %s-mode answers and citations',
    async (mode) => {
      const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
        question: 'Where is the answer?',
        mode,
        currentPage: { pageId, revisionId },
        requestMetadata: { origin: 'feishu', correlationId: 'corr-ai-question' },
      });
      await runWikiQuestionAction(action.id);
      const storedAction = await db.query.aiActions.findFirst({
        where: eq(schema.aiActions.id, action.id),
      });
      expect(storedAction?.requestMetadata).toMatchObject({
        origin: 'feishu',
        correlationId: 'corr-ai-question',
      });
      const events = await db.query.aiActionEvents.findMany({
        where: eq(schema.aiActionEvents.actionId, action.id),
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'question',
          payload: expect.objectContaining({ text: 'Where is the answer?' }),
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'text_delta',
          payload: expect.objectContaining({ text: 'Grounded answer [S1]' }),
        }),
      );
      const citationsEvent = events.find((event) => event.type === 'citations');
      expect(citationsEvent).toMatchObject({
        payload: { citations: [expect.objectContaining({ pageId })] },
      });
      // Citations carry the cited page's space so citation links can be
      // built correctly (e.g. /raw/... for a raw page) instead of
      // assuming every citation lives in the wiki space.
      const citations = (citationsEvent!.payload as { citations: { spaceSlug?: string }[] }).citations;
      expect(citations[0]?.spaceSlug).toBe(`qa-${spaceId}`);
    },
  );

  it('runs both queued question handlers without a Next request cache context', async () => {
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'full',
    });
    await runWikiQuestionAction(action.id);
    expect(cache.runWithoutDataCache).toHaveBeenCalledTimes(1);

    cache.runWithoutDataCache.mockClear();
    const created = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      requestedReview: 'admin_review',
    });
    if (created.fallback) throw new Error('Expected a tool-enabled action');
    await runToolEnabledWikiQuestionAction(created.action.id);
    expect(cache.runWithoutDataCache).toHaveBeenCalledTimes(1);
  });

  it('runs an anonymous Wiki question with public-content permissions', async () => {
    await db
      .update(schema.aiSettings)
      .set({ anonymousWikiAiEnabled: true })
      .where(eq(schema.aiSettings.id, 'default'));
    const action = await createWikiQuestion(buildAnonymousCtx(), {
      question: 'Where is the answer?',
      mode: 'retrieval',
    });

    await runWikiQuestionAction(action.id);

    const storedAction = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action.id) });
    expect(storedAction).toMatchObject({
      actorUserId: null,
      status: 'completed',
      rawConversationCaptureStatus: 'disabled',
    });
  });

  it('records raw conversation capture eligibility from the data source setting at create time (023)', async () => {
    const disabledAction = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'full',
      currentPage: { pageId, revisionId },
    });
    const disabledRow = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, disabledAction.id) });
    expect(disabledRow?.rawConversationCaptureStatus).toBe('disabled');

    await db
      .insert(schema.contentDataSourceSettings)
      .values({ sourceKey: 'ai-conversations', enabled: true });

    const enabledAction = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer, again?',
      mode: 'full',
      currentPage: { pageId, revisionId },
    });
    const enabledRow = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, enabledAction.id) });
    expect(enabledRow?.rawConversationCaptureStatus).toBe('pending');

    await db
      .update(schema.contentDataSourceSettings)
      .set({ enabled: false })
      .where(eq(schema.contentDataSourceSettings.sourceKey, 'ai-conversations'));

    // Toggling back off never rewrites the already-created action's status.
    const stillPending = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, enabledAction.id) });
    expect(stillPending?.rawConversationCaptureStatus).toBe('pending');
  });

  it('falls back to the legacy wiki-ai-conversations row when the renamed key has not been migrated yet (025)', async () => {
    // No row for either key may survive from a previous test in this file
    // (contentDataSourceSettings is not part of clearAiData's truncate set),
    // so this test owns its own clean slate rather than depending on order.
    await db.delete(schema.contentDataSourceSettings);
    await db
      .insert(schema.contentDataSourceSettings)
      .values({ sourceKey: 'wiki-ai-conversations', enabled: true });

    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Does the legacy alias still enable capture?',
      mode: 'full',
      currentPage: { pageId, revisionId },
    });
    const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action.id) });
    expect(row?.rawConversationCaptureStatus).toBe('pending');
  });

  it('requests a bounded output budget, never the whole context window', async () => {
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'full',
    });
    await runWikiQuestionAction(action.id);
    const requested = streamText.mock.calls[0]![0].maxOutputTokens as number;
    // Capped at the answer ceiling and well below the model's 32k window.
    expect(requested).toBe(8192);
    expect(requested).toBeLessThan(32_000);
    expect(streamText.mock.calls[0]![0].timeoutMs).toBeNull();
  });

  it('retries a transient query-embedding failure before retrieving sources', async () => {
    embed
      .mockRejectedValueOnce(new AiProviderError('PROVIDER_UNAVAILABLE', 'Temporary embedding connection failure', true))
      .mockResolvedValueOnce({ vectors: [[1, 0, 0]], usage: { inputTokens: 1 } });
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'retrieval',
    });

    await runWikiQuestionAction(action.id);

    expect(embed).toHaveBeenCalledTimes(2);
    const storedAction = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action.id) });
    expect(storedAction?.status).toBe('completed');
    expect(storedAction?.resultMetadata).not.toHaveProperty('retrievalDegraded');
  });

  it('degrades rather than failing when the embedding gateway reports its outage as a 4xx', async () => {
    // A gateway returning HTTP 400 for "circuit breaker is open" normalizes to
    // a non-retryable INVALID_RESPONSE. Retrieval is an enhancement, so it must
    // not take the whole turn down with advice to rephrase the question.
    embed.mockRejectedValue(
      new AiProviderError('INVALID_RESPONSE', 'HTTP 400: circuit breaker is open', false),
    );
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'retrieval',
    });

    await runWikiQuestionAction(action.id);

    const storedAction = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action.id) });
    expect(storedAction).toMatchObject({
      status: 'completed',
      resultMetadata: { retrievalDegraded: { code: 'INVALID_RESPONSE' } },
    });
  });

  it('still propagates a cancellation raised while embedding', async () => {
    embed.mockRejectedValue(new AiProviderError('CANCELLED', 'AI request was cancelled', false));
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'retrieval',
    });

    await expect(runWikiQuestionAction(action.id)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('skips baseline retrieval in tool-enabled retrieval-mode chat and lets the model decide', async () => {
    // Regression coverage: a tool-enabled turn used to run the full_text +
    // fuzzy + semantic search unconditionally before the model ever saw the
    // question, even for questions with no Wiki relevance. The model now
    // decides for itself via search_wiki/get_page, so no baseline retrieval
    // (and therefore no embedding call) happens up front.
    const created = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'What is 1+1?',
      mode: 'retrieval',
      requestedReview: 'admin_review',
    });
    expect(created.fallback).toBe(false);
    if (created.fallback) throw new Error('Expected a tool-enabled action');

    await runWikiQuestionAction(created.action.id);

    expect(embed).not.toHaveBeenCalled();
    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, created.action.id),
    });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'search_results' }));
    const storedAction = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, created.action.id) });
    expect(storedAction).toMatchObject({ status: 'completed' });
    expect(storedAction?.resultMetadata).not.toHaveProperty('retrievalDegraded');
  });

  it('cites a page the model reads itself via get_page in tool-enabled answers', async () => {
    streamText
      .mockImplementationOnce(async function* () {
        yield {
          type: 'delta',
          text: [
            '```tool',
            'tool_calls:',
            '  - tool: get_page',
            '    arguments:',
            `      pageId: "${pageId}"`,
            '    review: none',
            '```',
          ].join('\n'),
        };
        yield { type: 'usage', inputTokens: 8, outputTokens: 6 };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'delta', text: 'Grounded answer [S1]' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 4 };
      });

    const created = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'retrieval',
      requestedReview: 'admin_review',
    });
    if (created.fallback) throw new Error('Expected a tool-enabled action');

    await runWikiQuestionAction(created.action.id);

    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, created.action.id),
    });
    const citationsEvent = events.find((event) => event.type === 'citations');
    expect(citationsEvent).toMatchObject({
      payload: { citations: [expect.objectContaining({ pageId })] },
    });
    // Every surface renders the citations event itself, so a Markdown source
    // list in the answer text would show each cited page a second time.
    expect(events).toContainEqual(expect.objectContaining({
      type: 'text_delta',
      payload: expect.objectContaining({ text: 'Grounded answer [S1]' }),
    }));
  });

  it('retains provider reasoning and the shared Wiki AI role in tool-enabled answers', async () => {
    streamText.mockImplementationOnce(async function* () {
      yield { type: 'reasoning_delta', text: 'I should inspect the current Wiki context.' };
      yield { type: 'delta', text: 'Grounded answer [S1]' };
      yield { type: 'usage', inputTokens: 17, outputTokens: 9, cachedInputTokens: 3 };
    });
    const created = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'retrieval',
      requestedReview: 'admin_review',
    });
    expect(created.fallback).toBe(false);
    if (created.fallback) throw new Error('Expected a tool-enabled action');

    await runWikiQuestionAction(created.action.id);

    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, created.action.id),
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'reasoning_delta',
      payload: expect.objectContaining({ text: 'I should inspect the current Wiki context.' }),
    }));
    const request = streamText.mock.calls[0]![0] as { system: string; timeoutMs: number | null };
    expect(request.system).toContain('conversational knowledge agent embedded in this Next Wiki instance');
    expect(request.system).toContain('current Wiki is your working knowledge environment');
    expect(request.system).toContain('perform the appropriate tool calls instead of merely explaining');
    expect(request.timeoutMs).toBeNull();
    const storedAction = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, created.action.id) });
    // The streaming usage frame must reach the persisted usageMetadata so the
    // admin "AI usage" panel can sum outputTokens across completed chats.
    expect(storedAction?.usageMetadata).toMatchObject({
      inputTokens: 17,
      outputTokens: 9,
      cachedInputTokens: 3,
    });
  });

  it('uses a dedicated planner for tools and streams the final answer from wiki_text', async () => {
    const answerModel = await db.query.aiModels.findFirst({
      where: eq(schema.aiModels.externalId, 'text'),
    });
    if (!answerModel) throw new Error('fixture answer model is missing');
    const [plannerModel] = await db
      .insert(schema.aiModels)
      .values({
        providerId: answerModel.providerId,
        externalId: 'tool-planner',
        displayName: 'Tool planner',
        availability: 'available',
        contextWindow: 128_000,
      })
      .returning();
    await db.insert(schema.aiModelCapabilities).values({
      modelId: plannerModel!.id,
      capability: 'tool_calling',
      supported: true,
      source: 'manual',
    });
    await db.insert(schema.aiPurposeAssignments).values({
      purpose: 'wiki_tool_planning',
      modelId: plannerModel!.id,
      updatedBy: userId,
    });
    streamText
      .mockImplementationOnce(async function* () {
        yield { type: 'reasoning_delta', text: 'The planner has finished the tool workflow.' };
        yield { type: 'delta', text: 'Planner-only answer that must not be displayed.' };
        yield { type: 'usage', inputTokens: 7, outputTokens: 3 };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'reasoning_delta', text: 'Writing the final answer.' };
        yield { type: 'delta', text: 'Final answer from the selected answer model.' };
        yield { type: 'usage', inputTokens: 11, outputTokens: 5 };
      });

    const created = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Explain this topic',
      requestedReview: 'admin_review',
    });
    if (created.fallback) throw new Error('Expected a tool-enabled action');
    await runWikiQuestionAction(created.action.id);

    expect(streamText).toHaveBeenCalledTimes(2);
    expect(streamText.mock.calls[0]![0]).toMatchObject({ modelExternalId: 'tool-planner' });
    expect(streamText.mock.calls[1]![0]).toMatchObject({ modelExternalId: 'text' });
    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, created.action.id),
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'text_delta',
      payload: expect.objectContaining({ text: 'Final answer from the selected answer model.' }),
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'text_delta',
      payload: expect.objectContaining({ text: 'Planner-only answer that must not be displayed.' }),
    }));
    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, created.action.id) });
    expect(action).toMatchObject({
      status: 'completed',
      resultMetadata: expect.objectContaining({
        dedicatedPlanner: true,
        plannerModelId: plannerModel!.id,
      }),
      usageMetadata: expect.objectContaining({ inputTokens: 18, outputTokens: 8 }),
    });
  });

  it('batches character-sized reasoning deltas without dropping any text', async () => {
    const events: string[] = [];
    const reasoning = createBatchedReasoningAppender(async (text) => {
      events.push(text);
    }, 4);

    for (const character of 'abcdefghij') await reasoning.append(character);
    await reasoning.flush();

    expect(events.join('')).toBe('abcdefghij');
    expect(events).toHaveLength(4);
  });

  it('compresses attached sources and retries after a context-length error', async () => {
    streamText.mockReset();
    streamText
      .mockImplementationOnce(async function* () {
        // Provider rejects the first attempt as too long for its window.
        throw new AiProviderError(
          'INVALID_RESPONSE',
          "This endpoint's maximum context length is 262144 tokens. However, you requested about 266324 tokens. Please reduce the length.",
        );
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'delta', text: 'Grounded answer [S1]' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 4 };
      });

    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode: 'full',
    });
    await runWikiQuestionAction(action.id);

    expect(streamText).toHaveBeenCalledTimes(2);
    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, action.id),
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'text_delta',
        payload: expect.objectContaining({ text: 'Grounded answer [S1]' }),
      }),
    );
  });

  it('rechecks entitlement immediately before provider use', async () => {
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Question',
      mode: 'full',
    });
    await db
      .update(schema.userAiEntitlements)
      .set({ questionAnsweringEnabled: false })
      .where(eq(schema.userAiEntitlements.userId, userId));
    await expect(runWikiQuestionAction(action.id)).rejects.toMatchObject({
      code: 'AI_FEATURE_DISABLED',
    });
    expect(streamText).not.toHaveBeenCalled();
  });
});
