import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { chunkMarkdown } from '@/server/ai/chunking/markdown-chunker';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { providerRuntime } from '@/server/services/ai-admin';
import { readActionInput, finishAction } from '@/server/services/ai-actions';
import { refreshIndexCounters } from '@/server/services/ai-index';

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
      const embedded = chunks.length
        ? await adapter.embed({
            actionId,
            modelExternalId: model[0].model.externalId,
            inputs: chunks.map((chunk) => chunk.contentText),
            expectedDimensions: generation.embeddingDimensions,
            abortSignal: new AbortController().signal,
          })
        : { vectors: [] };
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
  await finishAction(actionId, 'completed', { resultMetadata: { generationId: generation.id } });
}
