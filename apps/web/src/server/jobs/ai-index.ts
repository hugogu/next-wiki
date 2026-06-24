import { and, asc, eq, lt, or } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { chunkMarkdown } from '@/server/ai/chunking/markdown-chunker';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { AiProviderError } from '@/server/ai/types';
import { providerRuntime } from '@/server/services/ai-admin';
import { readActionInput, finishAction, isCancellationRequested } from '@/server/services/ai-actions';
import { refreshIndexCounters } from '@/server/services/ai-index';

// Per-page embed retry. Embedding providers (notably OpenRouter-backed models)
// intermittently return 200 with a partial/empty data array or time out under
// load; without retry every affected page is marked permanently failed.
// Backoff: 1s, 4s, 16s — keeps total worst-case latency under ~30s per page.
const INDEX_EMBED_MAX_ATTEMPTS = 3;
const INDEX_EMBED_BACKOFF_MS = [1_000, 4_000, 16_000];

// A page that has been "running" for longer than this threshold is treated as
// orphaned: its worker process died (container restart, OOM, pg-boss expiry
// after 15 min, etc.) without ever flipping it to completed/failed. Re-claiming
// stale running pages on the next invocation self-heals stuck builds — without
// it, the worker only selects `pending` rows and the generation hangs forever
// (observed: 4 pages orphaned at `running`, 1391/1396 progress, action marked
// completed but generation stuck at `building`).
const STALE_RUNNING_THRESHOLD_MS = 5 * 60 * 1000;

function isRetryableEmbedError(error: unknown): boolean {
  if (error instanceof AiProviderError) return error.retryable;
  // Network-level fetch failures (ECONNRESET, undici ConnectTimeoutError, etc.)
  // are also transient and should be retried.
  const name = (error as { name?: string })?.name;
  return name === 'TypeError' || name === 'AggregateError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cancel cleanup: a never-activated build is dropped entirely (keep-only-active
// policy — its partial output is useless); an already-live index retains its
// chunks so retrieval keeps serving, mirroring the partial-failure invariant.
async function finalizeCancellation(actionId: string, generation: { id: string; isActive: boolean }): Promise<void> {
  if (generation.isActive) {
    // Force the live index back to `ready` so retrieval keeps accepting it.
    // refreshIndexCounters would bail on pending>0; pages not yet processed
    // retain their previously indexed chunks and stay pending for a retry.
    await db.update(schema.aiIndexGenerations)
      .set({ status: 'ready', errorCode: null, errorMessage: null })
      .where(eq(schema.aiIndexGenerations.id, generation.id));
    await finishAction(actionId, 'cancelled', { resultMetadata: { generationId: generation.id } });
    return;
  }
  await db.update(schema.aiActions)
    .set({ indexGenerationId: null })
    .where(eq(schema.aiActions.indexGenerationId, generation.id));
  // aiPageIndexStates and aiKnowledgeChunks cascade via onDelete.
  await db.delete(schema.aiIndexGenerations).where(eq(schema.aiIndexGenerations.id, generation.id));
  await finishAction(actionId, 'cancelled', { resultMetadata: { generationId: generation.id, deleted: true } });
}

export async function runIndexRebuildAction(actionId: string): Promise<void> {
  const input = await readActionInput<{ generationId: string }>(actionId);
  if (!input) throw new Error('Index action input expired');
  const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, input.generationId) });
  if (!generation) throw new Error('Index generation not found');
  const model = await db
    .select({ model: schema.aiModels, provider: schema.aiProviders })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(eq(schema.aiModels.id, generation.modelId))
    .limit(1);
  if (!model[0]) throw new Error('Embedding model not found');
  const adapter = createAiProviderAdapter(await providerRuntime(model[0].provider.id));
  const states = await db
    .select()
    .from(schema.aiPageIndexStates)
    .where(
      and(
        eq(schema.aiPageIndexStates.generationId, generation.id),
        or(
          eq(schema.aiPageIndexStates.status, 'pending'),
          and(
            eq(schema.aiPageIndexStates.status, 'running'),
            lt(schema.aiPageIndexStates.updatedAt, new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS)),
          ),
        ),
      ),
    )
    .orderBy(asc(schema.aiPageIndexStates.updatedAt));

  let cancelled = false;
  for (const state of states) {
    // Cheap PK lookup per page — lets an admin cancel a long rebuild without
    // waiting for it to exhaust all 1396 pages.
    if (await isCancellationRequested(actionId)) {
      cancelled = true;
      break;
    }
    await db.update(schema.aiPageIndexStates).set({ status: 'running', attempts: state.attempts + 1, updatedAt: new Date() }).where(and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.pageId, state.pageId)));
    try {
      if (!state.targetRevisionId) {
        await db.delete(schema.aiKnowledgeChunks).where(and(eq(schema.aiKnowledgeChunks.generationId, generation.id), eq(schema.aiKnowledgeChunks.pageId, state.pageId)));
        await db.update(schema.aiPageIndexStates).set({ status: 'removed', completedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.pageId, state.pageId)));
        continue;
      }
      const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, state.targetRevisionId) });
      if (!revision?.contentSource || revision.contentHash !== state.targetContentHash) throw new Error('Published revision changed before indexing');
      const chunks = chunkMarkdown(revision.contentSource, revision.contentHash);
      let embedded: { vectors: number[][] } = { vectors: [] };
      if (chunks.length) {
        // Retry transient provider failures (partial embeddings, timeouts,
        // rate limits). Without this, every page touched during a provider
        // hiccup is permanently marked failed.
        for (let attempt = 1; attempt <= INDEX_EMBED_MAX_ATTEMPTS; attempt += 1) {
          try {
            embedded = await adapter.embed({
              actionId,
              modelExternalId: model[0].model.externalId,
              inputs: chunks.map((chunk) => chunk.contentText),
              expectedDimensions: generation.embeddingDimensions,
              abortSignal: new AbortController().signal,
            });
            break;
          } catch (error) {
            if (attempt >= INDEX_EMBED_MAX_ATTEMPTS || !isRetryableEmbedError(error)) throw error;
            await db.update(schema.aiPageIndexStates).set({ attempts: state.attempts + attempt + 1, updatedAt: new Date() }).where(and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.pageId, state.pageId)));
            await sleep(INDEX_EMBED_BACKOFF_MS[attempt - 1] ?? 1_000);
          }
        }
      }
      const latest = await db.query.aiPageIndexStates.findFirst({ where: and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.pageId, state.pageId)) });
      if (latest?.targetRevisionId !== state.targetRevisionId || latest.targetContentHash !== state.targetContentHash) continue;
      await db.transaction(async (tx) => {
        await tx.delete(schema.aiKnowledgeChunks).where(and(eq(schema.aiKnowledgeChunks.generationId, generation.id), eq(schema.aiKnowledgeChunks.pageId, state.pageId)));
        if (chunks.length) {
          await tx.insert(schema.aiKnowledgeChunks).values(chunks.map((chunk, index) => ({
            generationId: generation.id,
            pageId: state.pageId,
            revisionId: state.targetRevisionId!,
            chunkIndex: chunk.chunkIndex,
            headingPath: chunk.headingPath,
            contentText: chunk.contentText,
            contentHash: chunk.contentHash,
            byteCount: chunk.byteCount,
            embedding: embedded.vectors[index]!,
          })));
        }
        await tx.update(schema.aiPageIndexStates).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date(), lastErrorCode: null, lastErrorMessage: null }).where(and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.pageId, state.pageId)));
      });
    } catch (error) {
      await db.update(schema.aiPageIndexStates).set({ status: 'failed', lastErrorCode: 'INDEX_PAGE_FAILED', lastErrorMessage: String(error).slice(0, 500), updatedAt: new Date() }).where(and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.pageId, state.pageId)));
    }
  }
  if (cancelled) {
    // Re-read in case the generation row was mutated by a concurrent run.
    const fresh = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, generation.id) });
    if (fresh) await finalizeCancellation(actionId, fresh);
    else await finishAction(actionId, 'cancelled', { resultMetadata: { generationId: generation.id } });
    return;
  }
  await refreshIndexCounters(generation.id);
  const completed = await db.query.aiIndexGenerations.findFirst({
    where: eq(schema.aiIndexGenerations.id, generation.id),
  });
  if (completed?.status === 'failed') {
    await finishAction(actionId, 'failed', {
      resultMetadata: { generationId: generation.id, failedPages: completed.failedPages },
      errorCode: completed.errorCode ?? 'INDEX_BUILD_FAILED',
      errorMessage: completed.errorMessage ?? 'Knowledge index build failed',
    });
    return;
  }
  await finishAction(actionId, 'completed', { resultMetadata: { generationId: generation.id } });
}
