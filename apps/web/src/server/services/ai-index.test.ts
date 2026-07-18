import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { createIndexRebuild, cancelIndexGeneration, deleteIndexGeneration, reconcilePageAcrossIndexes, refreshIndexCounters, retryIndexPages } from './ai-index';

describe('AI index lifecycle', () => {
  let adminId: string;
  let spaceId: string;
  let pageId: string;
  let revisionId: string;
  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
    spaceId = randomUUID();
    pageId = randomUUID();
    revisionId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `ai-index-${spaceId}`, name: 'AI index' });
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'page', path: 'page', title: 'Page', authorId: adminId,
      currentPublishedVersionId: revisionId, latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: 'body', contentHtml: '<p>body</p>',
      contentHash: 'hash', authorId: adminId, status: 'published', publishedAt: new Date(),
    });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Index fixture', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', status: 'healthy', createdBy: adminId, updatedBy: adminId,
    }).returning();
    const [model] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'embed', displayName: 'Embed',
      availability: 'available', embeddingDimensions: 3,
    }).returning();
    await db.insert(schema.aiPurposeAssignments).values({ purpose: 'wiki_embedding', modelId: model!.id, updatedBy: adminId });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(adminId);
  });

  it('builds, retries, and atomically activates a generation', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    expect(created.generation.embeddingDimensions).toBe(3);
    expect(await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, created.generation.id),
    })).toMatchObject({ targetRevisionId: revisionId, status: 'pending' });
    await db.update(schema.aiPageIndexStates).set({ status: 'failed' }).where(eq(schema.aiPageIndexStates.generationId, created.generation.id));
    await retryIndexPages(ctx, created.generation.id, []);
    await db.update(schema.aiPageIndexStates).set({ status: 'completed' }).where(eq(schema.aiPageIndexStates.generationId, created.generation.id));
    await refreshIndexCounters(created.generation.id);
    expect(await db.query.aiIndexGenerations.findFirst({
      where: eq(schema.aiIndexGenerations.id, created.generation.id),
    })).toMatchObject({ status: 'ready', isActive: true });
  });

  it('keeps the live index active and ready when an incremental page fails', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    const generationId = created.generation.id;
    // The generation already went live in a previous run.
    await db.update(schema.aiIndexGenerations)
      .set({ status: 'ready', isActive: true, readyAt: new Date() })
      .where(eq(schema.aiIndexGenerations.id, generationId));
    // A second page indexed cleanly; the first was re-queued after an edit and failed to embed.
    const okPageId = randomUUID();
    await db.insert(schema.pages).values({
      id: okPageId, spaceId, slug: 'page-2', path: 'page-2', title: 'Page 2', authorId: adminId,
    });
    await db.insert(schema.aiPageIndexStates).values({ generationId, pageId: okPageId, status: 'completed' });
    await db.update(schema.aiPageIndexStates).set({ status: 'failed' }).where(eq(schema.aiPageIndexStates.pageId, pageId));
    await refreshIndexCounters(generationId);
    // A single failed incremental page must not take the whole live index offline for retrieval.
    expect(await db.query.aiIndexGenerations.findFirst({
      where: eq(schema.aiIndexGenerations.id, generationId),
    })).toMatchObject({ status: 'ready', isActive: true, failedPages: 1 });
    await db.delete(schema.aiPageIndexStates).where(eq(schema.aiPageIndexStates.pageId, okPageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, okPageId));
  });

  it('marks a never-activated build failed when pages fail', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    const generationId = created.generation.id;
    await db.update(schema.aiPageIndexStates).set({ status: 'failed' }).where(eq(schema.aiPageIndexStates.generationId, generationId));
    await refreshIndexCounters(generationId);
    expect(await db.query.aiIndexGenerations.findFirst({
      where: eq(schema.aiIndexGenerations.id, generationId),
    })).toMatchObject({ status: 'failed', isActive: false });
  });

  it('deletes every prior generation when a new build goes live (overwrite semantics)', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    // An older active generation that the new build should replace.
    const previous = await createIndexRebuild(ctx, 'test');
    await db.update(schema.aiPageIndexStates).set({ status: 'completed' }).where(eq(schema.aiPageIndexStates.generationId, previous.generation.id));
    await refreshIndexCounters(previous.generation.id);
    expect(await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, previous.generation.id) })).toMatchObject({ isActive: true, status: 'ready' });

    // A failed/aborted generation from an earlier attempt — should also be wiped.
    const aborted = await createIndexRebuild(ctx, 'test');
    await db.update(schema.aiPageIndexStates).set({ status: 'failed' }).where(eq(schema.aiPageIndexStates.generationId, aborted.generation.id));
    await refreshIndexCounters(aborted.generation.id);

    // Build the replacement and let it go live.
    const next = await createIndexRebuild(ctx, 'test');
    await db.update(schema.aiPageIndexStates).set({ status: 'completed' }).where(eq(schema.aiPageIndexStates.generationId, next.generation.id));
    await refreshIndexCounters(next.generation.id);

    const remaining = await db.select().from(schema.aiIndexGenerations);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: next.generation.id, isActive: true, status: 'ready' });
    // Chunks and page states for dropped generations must cascade away.
    expect(await db.query.aiPageIndexStates.findFirst({ where: eq(schema.aiPageIndexStates.generationId, previous.generation.id) })).toBeUndefined();
    expect(await db.query.aiPageIndexStates.findFirst({ where: eq(schema.aiPageIndexStates.generationId, aborted.generation.id) })).toBeUndefined();
    // Audit actions keep their history but lose the dangling generation link.
    const dangling = await db.query.aiActions.findMany({ where: eq(schema.aiActions.indexGenerationId, previous.generation.id) });
    expect(dangling).toHaveLength(0);
  });

  it('cancels outstanding rebuild jobs for prior generations when a new rebuild starts', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    // First rebuild leaves a queued action (no worker runs in tests), standing
    // in for the backlog of incremental per-page rebuild jobs.
    const first = await createIndexRebuild(ctx, 'test');
    expect(await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, first.action.id) }))
      .toMatchObject({ status: 'queued', cancelRequested: false });

    // A fresh full rebuild supersedes the prior generation, so its outstanding
    // action is flagged cancelled (its worker run then early-returns without
    // embedding) instead of blocking the new rebuild's job in the queue.
    const second = await createIndexRebuild(ctx, 'test');
    expect(await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, first.action.id) }))
      .toMatchObject({ cancelRequested: true });
    // The new rebuild's own action must stay runnable.
    expect(await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, second.action.id) }))
      .toMatchObject({ status: 'queued', cancelRequested: false });
  });

  it('deletes an inactive generation but refuses the active one', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    const generationId = created.generation.id;
    // Active generation is protected.
    await db.update(schema.aiIndexGenerations).set({ status: 'ready', isActive: true }).where(eq(schema.aiIndexGenerations.id, generationId));
    await expect(deleteIndexGeneration(ctx, generationId)).rejects.toMatchObject({ code: 'CONFLICT' });
    // Once retired it can be deleted, cascading its page states and nulling audit links.
    await db.update(schema.aiIndexGenerations).set({ isActive: false, status: 'superseded' }).where(eq(schema.aiIndexGenerations.id, generationId));
    await deleteIndexGeneration(ctx, generationId);
    expect(await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) })).toBeUndefined();
    expect(await db.query.aiPageIndexStates.findFirst({ where: eq(schema.aiPageIndexStates.generationId, generationId) })).toBeUndefined();
    expect(
      await db.query.aiActions.findFirst({ where: eq(schema.aiActions.indexGenerationId, generationId) }),
    ).toBeUndefined();
  });

  it('cancels the active build action of a building generation', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    const generationId = created.generation.id;
    expect(created.action.id).toBeDefined();

    await cancelIndexGeneration(ctx, generationId);

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, created.action.id) });
    expect(action?.cancelRequested).toBe(true);
  });

  it('refuses to cancel a generation that is not currently building', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    const generationId = created.generation.id;
    await db.update(schema.aiPageIndexStates).set({ status: 'completed' }).where(eq(schema.aiPageIndexStates.generationId, generationId));
    await refreshIndexCounters(generationId);
    // Now ready+active — nothing to cancel.
    await expect(cancelIndexGeneration(ctx, generationId)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to cancel a non-existent generation', async () => {
    await expect(cancelIndexGeneration(buildUserCtx(adminId, 'admin'), randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reconciles pages without dispatching when AI is disabled, preserving pending state for later', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    const generationId = created.generation.id;
    // Keep the index live, then turn AI off — a content write (e.g. Wiki.js
    // import) must still succeed, only deferring the rebuild dispatch.
    await db.update(schema.aiIndexGenerations)
      .set({ status: 'ready', isActive: true, readyAt: new Date() })
      .where(eq(schema.aiIndexGenerations.id, generationId));
    await db.update(schema.aiSettings).set({ enabled: false }).where(eq(schema.aiSettings.id, 'default'));
    await db.delete(schema.aiActions);

    await expect(reconcilePageAcrossIndexes(pageId, ctx)).resolves.toBeUndefined();

    // The durable "needs indexing" marker is written so a later rebuild picks it up…
    expect(await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, generationId),
    })).toMatchObject({ pageId, status: 'pending' });
    // …but no rebuild worker action is queued while AI is off.
    expect(await db.query.aiActions.findFirst({
      where: eq(schema.aiActions.feature, 'index_rebuild'),
    })).toBeUndefined();
  });
});
