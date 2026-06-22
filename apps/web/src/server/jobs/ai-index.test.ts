import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { AiProviderError } from '@/server/ai/types';
import { encryptAiJson } from '@/server/crypto/ai-encryption';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';

const embed = vi.hoisted(() => vi.fn());
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: () => ({ embed }),
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

import { runIndexRebuildAction } from './ai-index';

describe('index rebuild worker', () => {
  let userId: string;
  let pageId: string;
  let revisionId: string;
  let spaceId: string;
  let generationId: string;
  let actionId: string;

  beforeEach(async () => {
    await clearAiData();
    embed.mockReset();

    userId = await createAiTestUser('admin');
    spaceId = randomUUID();
    pageId = randomUUID();
    revisionId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `idx-${spaceId}`, name: 'Idx' });
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'page', path: 'page', title: 'Page', authorId: userId,
      currentPublishedVersionId: revisionId, latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: '# Heading\n\nSome content to embed.',
      contentHtml: '<p>Some content to embed.</p>', contentHash: 'rev-hash', authorId: userId,
      status: 'published', publishedAt: new Date(),
    });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true, updatedBy: userId });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Idx provider', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', status: 'healthy', createdBy: userId, updatedBy: userId,
    }).returning();
    const [embeddingModel] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'embed', displayName: 'Embed',
      availability: 'available', embeddingDimensions: 3,
    }).returning();
    const [generation] = await db.insert(schema.aiIndexGenerations).values({
      modelId: embeddingModel!.id, embeddingDimensions: 3, chunkerVersion: 'markdown-v1',
      status: 'building', isActive: true,
    }).returning();
    generationId = generation!.id;
    await db.insert(schema.aiPageIndexStates).values({
      generationId, pageId, targetRevisionId: revisionId, targetContentHash: 'rev-hash', status: 'pending',
    });
    const [action] = await db.insert(schema.aiActions).values({
      feature: 'index_rebuild', actorUserId: userId, status: 'queued',
      indexGenerationId: generationId, expiresAt: new Date(Date.now() + 60_000),
    }).returning();
    actionId = action!.id;
    await db.insert(schema.aiActionInputs).values({
      actionId,
      payloadEncrypted: encryptAiJson({ generationId }),
      payloadHash: 'hash', expiresAt: new Date(Date.now() + 60_000),
    });
  });

  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(userId);
  });

  it('retries transient embedding failures and ultimately succeeds', async () => {
    let call = 0;
    embed.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        // Simulate the production failure: provider returned partial response
        throw new AiProviderError(
          'INVALID_RESPONSE',
          'Provider returned the wrong embedding count (got 0, expected 1)',
          true,
        );
      }
      return { vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 1 } };
    });

    await runIndexRebuildAction(actionId);

    const state = await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, generationId),
    });
    expect(state?.status).toBe('completed');
    expect(state?.attempts).toBeGreaterThanOrEqual(2);
    expect(embed).toHaveBeenCalledTimes(2);
    const chunks = await db.query.aiKnowledgeChunks.findMany({
      where: eq(schema.aiKnowledgeChunks.generationId, generationId),
    });
    expect(chunks).toHaveLength(1);
  });

  it('marks the page failed when an error is not retryable', async () => {
    embed.mockRejectedValue(
      new AiProviderError('MODEL_NOT_FOUND', 'AI model was not found', false),
    );

    await runIndexRebuildAction(actionId);

    const state = await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, generationId),
    });
    expect(state?.status).toBe('failed');
    expect(state?.lastErrorMessage).toContain('AI model was not found');
    expect(embed).toHaveBeenCalledTimes(1);
  });
});
