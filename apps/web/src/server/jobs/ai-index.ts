import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { chunkMarkdown } from '@/server/ai/chunking/markdown-chunker';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { AiProviderError } from '@/server/ai/types';
import { providerRuntime } from '@/server/services/ai-admin';
import { readActionInput, finishAction } from '@/server/services/ai-actions';
import { refreshIndexCounters } from '@/server/services/ai-index';

// Per-page embed retry. Embedding providers (notably OpenRouter-backed models)
// intermittently return 200 with a partial/empty data array or time out under
// load; without retry every affected page is marked permanently failed.
// Backoff: 1s, 4s, 16s — keeps total worst-case latency under ~30s per page.
const INDEX_EMBED_MAX_ATTEMPTS = 3;
const INDEX_EMBED_BACKOFF_MS = [1_000, 4_000, 16_000];

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
    .where(and(eq(schema.aiPageIndexStates.generationId, generation.id), eq(schema.aiPageIndexStates.status, 'pending')))
    .orderBy(asc(schema.aiPageIndexStates.updatedAt));

  for (const state of states) {
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
