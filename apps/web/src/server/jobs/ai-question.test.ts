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

import { createWikiQuestion } from '@/server/services/ai-question';
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
      id: pageId, spaceId, slug: 'answer', path: 'answer', title: 'Answer', authorId: userId,
      currentPublishedVersionId: revisionId, latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: 'The grounded answer is here.',
      contentHtml: '<p>The grounded answer is here.</p>', contentHash: 'hash', authorId: userId,
      status: 'published', publishedAt: new Date(),
    });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    await db.insert(schema.userAiEntitlements).values({ userId, questionAnsweringEnabled: true, updatedBy: userId });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Question provider', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', status: 'healthy', createdBy: userId, updatedBy: userId,
    }).returning();
    const [textModel] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'text', displayName: 'Text',
      availability: 'available', contextWindow: 32_000,
    }).returning();
    const [embeddingModel] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'embed', displayName: 'Embed',
      availability: 'available', embeddingDimensions: 3,
    }).returning();
    await db.insert(schema.aiPurposeAssignments).values({ purpose: 'wiki_text', modelId: textModel!.id, updatedBy: userId });
    const [generation] = await db.insert(schema.aiIndexGenerations).values({
      modelId: embeddingModel!.id, embeddingDimensions: 3, chunkerVersion: 'test',
      status: 'ready', isActive: true,
    }).returning();
    await db.insert(schema.aiKnowledgeChunks).values({
      generationId: generation!.id, pageId, revisionId, chunkIndex: 0,
      contentText: 'The grounded answer is here.', contentHash: 'chunk',
      byteCount: 28, embedding: [1, 0, 0],
    });
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(userId);
  });

  it.each(['full', 'retrieval'] as const)('streams grounded %s-mode answers and citations', async (mode) => {
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Where is the answer?',
      mode,
      currentPage: { pageId, revisionId },
    });
    await runWikiQuestionAction(action.id);
    const events = await db.query.aiActionEvents.findMany({ where: eq(schema.aiActionEvents.actionId, action.id) });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'text_delta',
      payload: expect.objectContaining({ text: 'Grounded answer [S1]' }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'citations',
      payload: expect.objectContaining({ citations: [expect.objectContaining({ pageId })] }),
    }));
  });

  it('rechecks entitlement immediately before provider use', async () => {
    const action = await createWikiQuestion(buildUserCtx(userId, 'reader'), {
      question: 'Question',
      mode: 'full',
    });
    await db.update(schema.userAiEntitlements).set({ questionAnsweringEnabled: false }).where(eq(schema.userAiEntitlements.userId, userId));
    await expect(runWikiQuestionAction(action.id)).rejects.toMatchObject({ code: 'AI_FEATURE_DISABLED' });
    expect(streamText).not.toHaveBeenCalled();
  });
});
