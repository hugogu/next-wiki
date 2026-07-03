import { eq } from 'drizzle-orm';
import type { AiSearchResult } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { exactCosineSearch, type VectorMatch } from '@/server/ai/retrieval/vector-search';
import { providerRuntime } from './ai-admin';
import { assertAiFeature } from './ai-entitlements';
import { createAction, readActionInput, appendActionEvent, finishAction } from './ai-actions';

export async function createSemanticSearch(ctx: PermCtx, input: { query: string; limit: number }) {
  await assertAiFeature(ctx, 'search');
  const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.isActive, true) });
  if (!generation || generation.status !== 'ready') throw new DomainError('INDEX_NOT_READY', 'Semantic index is not ready');
  const model = await db
    .select({ model: schema.aiModels, provider: schema.aiProviders })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(eq(schema.aiModels.id, generation.modelId))
    .limit(1);
  if (!model[0]) throw new DomainError('AI_NOT_CONFIGURED', 'Embedding model is unavailable');
  return createAction(ctx, {
    feature: 'semantic_search',
    input,
    providerId: model[0].provider.id,
    modelId: model[0].model.id,
    indexGenerationId: generation.id,
    requestMetadata: { queryBytes: Buffer.byteLength(input.query), limit: input.limit },
  });
}

export async function retrieve(
  generationId: string,
  queryVector: number[],
  limit: number,
): Promise<AiSearchResult[]> {
  const matches = await exactCosineSearch(generationId, queryVector, Math.max(limit * 10, 100));
  const chunksByPage = new Map<string, VectorMatch[]>();
  for (const match of matches) {
    const group = chunksByPage.get(match.pageId) ?? [];
    group.push(match);
    chunksByPage.set(match.pageId, group);
  }
  return [...chunksByPage.entries()]
    .map(([pageId, pageMatches]) => {
      const best = pageMatches.sort((a, b) => b.score - a.score)[0]!;
      const combinedExcerpt = pageMatches
        .slice(0, 3)
        .map((m) => m.contentText)
        .join('\n\n')
        .slice(0, 1200);
      return {
        pageId,
        title: best.title,
        path: best.path,
        locale: best.locale,
        revisionId: best.revisionId,
        revisionHash: best.contentHash,
        excerpt: combinedExcerpt,
        score: best.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function runSemanticSearchAction(actionId: string): Promise<void> {
  const input = await readActionInput<{ query: string; limit: number }>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.modelId || !action.providerId || !action.indexGenerationId) throw new Error('Semantic search input expired');
  const model = await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) });
  const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, action.indexGenerationId) });
  if (!model || !generation) throw new Error('Semantic search model or index is unavailable');
  const output = await createAiProviderAdapter(await providerRuntime(action.providerId)).embed({
    actionId,
    modelExternalId: model.externalId,
    inputs: [input.query],
    expectedDimensions: generation.embeddingDimensions,
    abortSignal: new AbortController().signal,
  });
  const results = await retrieve(generation.id, output.vectors[0]!, input.limit);
  await appendActionEvent(actionId, 'search_results', { results });
  await finishAction(actionId, 'completed', { resultMetadata: { resultCount: results.length }, usageMetadata: output.usage ?? {} });
}
