import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { AiIndexView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { CHUNKER_VERSION } from '@/server/ai/chunking/markdown-chunker';
import { createAction, requestActionCancellation } from './ai-actions';

function assertAdmin(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage AI indexes');
  }
}

async function toView(row: typeof schema.aiIndexGenerations.$inferSelect): Promise<AiIndexView> {
  const model = await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, row.modelId) });
  return {
    id: row.id,
    modelId: row.modelId,
    modelName: model?.displayName ?? 'Unknown model',
    embeddingDimensions: row.embeddingDimensions,
    chunkerVersion: row.chunkerVersion,
    status: row.status,
    isActive: row.isActive,
    totalPages: row.totalPages,
    completedPages: row.completedPages,
    failedPages: row.failedPages,
    startedAt: row.startedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listIndexes(ctx: PermCtx): Promise<AiIndexView[]> {
  assertAdmin(ctx);
  const rows = await db.select().from(schema.aiIndexGenerations).orderBy(asc(schema.aiIndexGenerations.createdAt));
  return Promise.all(rows.map(toView));
}

export async function getIndex(ctx: PermCtx, id: string): Promise<AiIndexView> {
  assertAdmin(ctx);
  const row = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, id) });
  if (!row) throw new DomainError('NOT_FOUND', 'AI index not found');
  return toView(row);
}

export async function deleteIndexGeneration(ctx: PermCtx, id: string): Promise<void> {
  assertAdmin(ctx);
  const row = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, id) });
  if (!row) throw new DomainError('NOT_FOUND', 'AI index not found');
  if (row.isActive) throw new DomainError('CONFLICT', 'The active knowledge index cannot be deleted');
  if (row.status === 'building') throw new DomainError('CONFLICT', 'A building knowledge index cannot be deleted');
  await db.transaction(async (tx) => {
    // Audit actions keep their history but lose the dangling generation link
    // (the FK has no cascade); chunks and page states cascade automatically.
    await tx
      .update(schema.aiActions)
      .set({ indexGenerationId: null })
      .where(eq(schema.aiActions.indexGenerationId, id));
    await tx.delete(schema.aiIndexGenerations).where(eq(schema.aiIndexGenerations.id, id));
  });
}

export async function cancelIndexGeneration(ctx: PermCtx, generationId: string): Promise<void> {
  assertAdmin(ctx);
  const row = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) });
  if (!row) throw new DomainError('NOT_FOUND', 'AI index not found');
  if (row.status !== 'building') throw new DomainError('CONFLICT', 'Only a building knowledge index can be cancelled');
  // The worker polls this flag each page and finalizes the cancellation itself
  // (deleting a never-activated generation, or leaving a live index intact).
  const action = await db.query.aiActions.findFirst({
    where: and(
      eq(schema.aiActions.indexGenerationId, generationId),
      inArray(schema.aiActions.status, ['queued', 'running']),
    ),
    orderBy: desc(schema.aiActions.queuedAt),
  });
  if (!action) throw new DomainError('NOT_FOUND', 'No active build action to cancel');
  await requestActionCancellation(ctx, action.id);
}

export async function createIndexRebuild(ctx: PermCtx, reason = 'manual') {
  assertAdmin(ctx);
  const assignment = await db
    .select({ model: schema.aiModels, provider: schema.aiProviders })
    .from(schema.aiPurposeAssignments)
    .innerJoin(schema.aiModels, eq(schema.aiPurposeAssignments.modelId, schema.aiModels.id))
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(eq(schema.aiPurposeAssignments.purpose, 'wiki_embedding'))
    .limit(1);
  const selected = assignment[0];
  if (!selected) throw new DomainError('AI_NOT_CONFIGURED', 'No embedding model is assigned');
  if (!selected.model.embeddingDimensions) {
    throw new DomainError('EMBEDDING_DIMENSIONS_REQUIRED', 'Embedding dimensions are required');
  }
  const pages = await db
    .select({
      pageId: schema.pages.id,
      revisionId: schema.pages.currentPublishedVersionId,
      contentHash: schema.pageRevisions.contentHash,
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(and(isNull(schema.pages.deletedAt), isNotNull(schema.pages.currentPublishedVersionId)));

  const generation = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.aiIndexGenerations)
      .values({
        modelId: selected.model.id,
        embeddingDimensions: selected.model.embeddingDimensions!,
        chunkerVersion: CHUNKER_VERSION,
        totalPages: pages.length,
        createdBy: getActorUserId(ctx),
        startedAt: new Date(),
      })
      .returning();
    if (pages.length) {
      await tx.insert(schema.aiPageIndexStates).values(
        pages.map((page) => ({
          generationId: created!.id,
          pageId: page.pageId,
          targetRevisionId: page.revisionId,
          targetContentHash: page.contentHash,
        })),
      );
    }
    return created!;
  });
  const action = await createAction(ctx, {
    feature: 'index_rebuild',
    input: { generationId: generation.id },
    providerId: selected.provider.id,
    modelId: selected.model.id,
    indexGenerationId: generation.id,
    requestMetadata: { reason, totalPages: pages.length },
  });
  return { action, generation: await toView(generation) };
}

export async function reconcilePageAcrossIndexes(pageId: string, ctx?: PermCtx): Promise<void> {
  const generations = await db
    .select({
      id: schema.aiIndexGenerations.id,
      modelId: schema.aiIndexGenerations.modelId,
      providerId: schema.aiProviders.id,
    })
    .from(schema.aiIndexGenerations)
    .innerJoin(schema.aiModels, eq(schema.aiIndexGenerations.modelId, schema.aiModels.id))
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(inArray(schema.aiIndexGenerations.status, ['building', 'ready']));
  if (!generations.length) return;
  const page = await db
    .select({
      revisionId: schema.pages.currentPublishedVersionId,
      contentHash: schema.pageRevisions.contentHash,
      deletedAt: schema.pages.deletedAt,
    })
    .from(schema.pages)
    .leftJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(eq(schema.pages.id, pageId))
    .limit(1);
  for (const generation of generations) {
    const targetRevisionId = page[0]?.deletedAt ? null : page[0]?.revisionId ?? null;
    await db
      .insert(schema.aiPageIndexStates)
      .values({
        generationId: generation.id,
        pageId,
        targetRevisionId,
        targetContentHash: targetRevisionId ? page[0]?.contentHash ?? null : null,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: [schema.aiPageIndexStates.generationId, schema.aiPageIndexStates.pageId],
        set: {
          targetRevisionId,
          targetContentHash: targetRevisionId ? page[0]?.contentHash ?? null : null,
          status: 'pending',
          attempts: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: new Date(),
        },
      });
    if (ctx?.actor.kind === 'user') {
      await createAction(ctx, {
        feature: 'index_rebuild',
        input: { generationId: generation.id },
        providerId: generation.providerId,
        modelId: generation.modelId,
        indexGenerationId: generation.id,
        pageId,
        requestMetadata: { reconciliation: true, pageId },
      });
    }
  }
}

export async function retryIndexPages(ctx: PermCtx, generationId: string, pageIds: string[]) {
  assertAdmin(ctx);
  await db
    .update(schema.aiPageIndexStates)
    .set({ status: 'pending', availableAt: new Date(), lastErrorCode: null, lastErrorMessage: null })
    .where(
      and(
        eq(schema.aiPageIndexStates.generationId, generationId),
        pageIds.length
          ? inArray(schema.aiPageIndexStates.pageId, pageIds)
          : eq(schema.aiPageIndexStates.status, 'failed'),
      ),
    );
  return createAction(ctx, {
    feature: 'index_rebuild',
    input: { generationId },
    indexGenerationId: generationId,
    requestMetadata: { retry: true, pageCount: pageIds.length },
  });
}

export async function refreshIndexCounters(generationId: string): Promise<void> {
  const rows = await db
    .select({ status: schema.aiPageIndexStates.status, value: count() })
    .from(schema.aiPageIndexStates)
    .where(eq(schema.aiPageIndexStates.generationId, generationId))
    .groupBy(schema.aiPageIndexStates.status);
  const values = new Map(rows.map((row) => [row.status, Number(row.value)]));
  const failedPages = values.get('failed') ?? 0;
  const completedPages = (values.get('completed') ?? 0) + (values.get('removed') ?? 0);
  const totalPages = [...values.values()].reduce((sum, value) => sum + value, 0);
  const pending = (values.get('pending') ?? 0) + (values.get('running') ?? 0);
  await db.update(schema.aiIndexGenerations).set({ totalPages, completedPages, failedPages }).where(eq(schema.aiIndexGenerations.id, generationId));
  if (pending > 0) return;

  const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generationId) });
  if (generation?.isActive) {
    // The live index must keep serving queries. Pages that failed an incremental
    // update retain their previously indexed chunks and surface via failedPages
    // for admin retry — a partial failure must never take the active index
    // offline (clears any stale failure left by an earlier reconcile run).
    await db.update(schema.aiIndexGenerations).set({ status: 'ready', errorCode: null, errorMessage: null }).where(eq(schema.aiIndexGenerations.id, generationId));
  } else if (failedPages === 0) {
    await db.transaction(async (tx) => {
      // Overwrite semantics: keep exactly one generation — the live one. Audit
      // actions keep their history but lose the dangling FK link (the FK has no
      // cascade); chunks and page states cascade automatically.
      await tx
        .update(schema.aiActions)
        .set({ indexGenerationId: null })
        .where(and(isNotNull(schema.aiActions.indexGenerationId), ne(schema.aiActions.indexGenerationId, generationId)));
      await tx.delete(schema.aiIndexGenerations).where(ne(schema.aiIndexGenerations.id, generationId));
      await tx
        .update(schema.aiIndexGenerations)
        .set({ isActive: true, status: 'ready', readyAt: new Date(), finishedAt: new Date() })
        .where(eq(schema.aiIndexGenerations.id, generationId));
    });
  } else {
    await db.update(schema.aiIndexGenerations).set({ status: 'failed', finishedAt: new Date(), errorCode: 'INDEX_BUILD_FAILED', errorMessage: `${failedPages} page(s) failed` }).where(eq(schema.aiIndexGenerations.id, generationId));
  }
}
