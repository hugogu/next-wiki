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

  it('records accumulated embedding input tokens on the completed action', async () => {
    embed.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 42 } });

    await runIndexRebuildAction(actionId);

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(action?.status).toBe('completed');
    // The Usage panel sums usageMetadata.inputTokens; leaving it unset showed 0.
    expect((action?.usageMetadata as { inputTokens?: number }).inputTokens).toBe(42);
  });

  it('publishes incremental progress counters during a long build, not only at the end', async () => {
    // Add enough pages to cross the mid-run counter-refresh interval (10).
    const extraPageIds: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const pid = randomUUID();
      const rid = randomUUID();
      extraPageIds.push(pid);
      await db.insert(schema.pages).values({ id: pid, spaceId, slug: `p-${i}`, path: `p-${i}`, title: `P${i}`, authorId: userId, currentPublishedVersionId: rid, latestVersionId: rid });
      await db.insert(schema.pageRevisions).values({ id: rid, pageId: pid, versionNumber: 1, contentSource: '# H\n\nBody.', contentHtml: '<p>Body.</p>', contentHash: `h-${i}`, authorId: userId, status: 'published', publishedAt: new Date() });
      await db.insert(schema.aiPageIndexStates).values({ generationId, pageId: pid, targetRevisionId: rid, targetContentHash: `h-${i}`, status: 'pending' });
    }

    // Snapshot the generation's persisted completed-page counter on every embed
    // call, i.e. while the run is still in flight.
    const snapshots: number[] = [];
    embed.mockImplementation(async () => {
      const gen = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) });
      snapshots.push(gen?.completedPages ?? 0);
      return { vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 1 } };
    });

    await runIndexRebuildAction(actionId);

    // The counter advanced mid-run (before the final refresh), so the UI shows a
    // moving bar instead of 0/N until completion.
    expect(Math.max(...snapshots)).toBeGreaterThan(0);
    expect(Math.min(...snapshots)).toBe(0); // the earliest pages saw a fresh 0
    const gen = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) });
    expect(gen?.completedPages).toBe(25);

    for (const pid of extraPageIds) {
      await db.delete(schema.aiKnowledgeChunks).where(eq(schema.aiKnowledgeChunks.pageId, pid));
      await db.delete(schema.aiPageIndexStates).where(eq(schema.aiPageIndexStates.pageId, pid));
      await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pid));
      await db.delete(schema.pages).where(eq(schema.pages.id, pid));
    }
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

  it('re-claims a page orphaned in running state by a crashed prior run', async () => {
    // A previous worker marked the page running then died without completing it.
    // Its updatedAt is stale, so the next invocation must reclaim rather than skip it.
    await db.update(schema.aiPageIndexStates)
      .set({ status: 'running', attempts: 1, updatedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(schema.aiPageIndexStates.generationId, generationId));
    embed.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 1 } });

    await runIndexRebuildAction(actionId);

    const state = await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, generationId),
    });
    expect(state?.status).toBe('completed');
    expect(state?.attempts).toBeGreaterThanOrEqual(2);
  });

  it('ignores a running page whose worker is still presumably alive', async () => {
    // Recently flipped to running — a concurrent worker may still own it.
    await db.update(schema.aiPageIndexStates)
      .set({ status: 'running', attempts: 1, updatedAt: new Date() })
      .where(eq(schema.aiPageIndexStates.generationId, generationId));
    embed.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 1 } });

    await runIndexRebuildAction(actionId);

    const state = await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, generationId),
    });
    expect(state?.status).toBe('running');
    expect(embed).not.toHaveBeenCalled();
  });

  it('stops the build and drops the partial generation when cancel is requested', async () => {
    // Fresh (never-active) build cancelled mid-flight — the partial output is useless.
    await db.update(schema.aiIndexGenerations).set({ isActive: false }).where(eq(schema.aiIndexGenerations.id, generationId));
    await db.update(schema.aiActions).set({ cancelRequested: true }).where(eq(schema.aiActions.id, actionId));
    embed.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 1 } });

    await runIndexRebuildAction(actionId);

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(action?.status).toBe('cancelled');
    expect(await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) })).toBeUndefined();
    expect(await db.query.aiKnowledgeChunks.findMany({ where: eq(schema.aiKnowledgeChunks.generationId, generationId) })).toHaveLength(0);
    expect(embed).not.toHaveBeenCalled();
  });

  it('leaves the live index intact when an incremental rebuild is cancelled', async () => {
    // Active generation: cancelling an incremental reconcile must not take it offline.
    await db.update(schema.aiPageIndexStates).set({ status: 'pending' }).where(eq(schema.aiPageIndexStates.generationId, generationId));
    await db.update(schema.aiActions).set({ cancelRequested: true }).where(eq(schema.aiActions.id, actionId));
    embed.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]], usage: { inputTokens: 1 } });

    await runIndexRebuildAction(actionId);

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(action?.status).toBe('cancelled');
    const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) });
    expect(generation?.isActive).toBe(true);
    expect(generation?.status).toBe('ready');
  });
});
