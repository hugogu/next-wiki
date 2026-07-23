import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';

const streamText = vi.hoisted(() => vi.fn());
const embed = vi.hoisted(() => vi.fn());
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: () => ({ streamText, embed }),
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
import { runWikiQuestionAction } from './ai-question';

describe('Wiki question worker', () => {
  let userId: string;
  let pageId: string;
  let revisionId: string;
  let spaceId: string;
  beforeEach(async () => {
    await clearAiData();
    streamText.mockReset();
    embed.mockReset();
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
      // built correctly (e.g. /spaces/raw/... for a raw page) instead of
      // assuming every citation lives in the wiki space.
      const citations = (citationsEvent!.payload as { citations: { spaceSlug?: string }[] }).citations;
      expect(citations[0]?.spaceSlug).toBe(`qa-${spaceId}`);
    },
  );

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

  it('continues a tool-enabled answer when the embedding provider remains temporarily unavailable', async () => {
    embed.mockRejectedValue(new AiProviderError('PROVIDER_UNAVAILABLE', 'Temporary embedding connection failure', true));
    const created = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Summarize the previous answer.',
      mode: 'retrieval',
      requestedReview: 'admin_review',
    });
    expect(created.fallback).toBe(false);
    if (created.fallback) throw new Error('Expected a tool-enabled action');

    await runWikiQuestionAction(created.action.id);

    expect(embed).toHaveBeenCalledTimes(3);
    const storedAction = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, created.action.id) });
    expect(storedAction).toMatchObject({
      status: 'completed',
      resultMetadata: { retrievalDegraded: { code: 'PROVIDER_UNAVAILABLE' } },
    });
    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, created.action.id),
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'text_delta',
      payload: expect.objectContaining({ text: 'Grounded answer [S1]' }),
    }));
  });

  it('retains provider reasoning and the shared Wiki AI role in tool-enabled answers', async () => {
    streamText.mockImplementationOnce(async function* () {
      yield { type: 'reasoning_delta', text: 'I should inspect the current Wiki context.' };
      yield { type: 'delta', text: 'Grounded answer [S1]' };
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
    const request = streamText.mock.calls[0]![0] as { system: string };
    expect(request.system).toContain('conversational knowledge agent embedded in this Next Wiki instance');
    expect(request.system).toContain('current Wiki is your working knowledge environment');
    expect(request.system).toContain('perform the appropriate tool calls instead of merely explaining');
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
