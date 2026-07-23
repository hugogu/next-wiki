import { eq } from 'drizzle-orm';
import type { AiQuestionMode, AiSearchResult } from '@next-wiki/shared';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { searchResultsToSources, type QuestionSource } from '@/server/ai/prompts/wiki-question';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { providerRuntime } from '@/server/services/ai-admin';
import { retrieve } from '@/server/services/ai-retrieval';
import { getSearchSettings } from '@/server/services/search-settings';
import { loadReadableFullContext } from './full-context';

export function filterWikiQuestionResults(
  results: AiSearchResult[],
  minimumScore: number,
): AiSearchResult[] {
  return results.filter((result) => result.score >= minimumScore);
}

export async function loadWikiQuestionSources(input: {
  ctx: PermCtx;
  actionId: string;
  question: string;
  mode: AiQuestionMode;
  textContextWindow: number | null;
}): Promise<{ sources: QuestionSource[]; usage: Record<string, unknown> }> {
  if (input.mode === 'full') {
    return {
      sources: await loadReadableFullContext(input.ctx, input.textContextWindow, input.question),
      usage: {},
    };
  }

  const [generation, searchSettings] = await Promise.all([
    db.query.aiIndexGenerations.findFirst({
      where: eq(schema.aiIndexGenerations.isActive, true),
    }),
    getSearchSettings(),
  ]);
  if (!generation || generation.status !== 'ready') {
    throw new DomainError('INDEX_NOT_READY', 'Semantic index is not ready');
  }

  const embeddingModel = await db.query.aiModels.findFirst({
    where: eq(schema.aiModels.id, generation.modelId),
  });
  if (!embeddingModel) throw new DomainError('MODEL_NOT_FOUND', 'Embedding model not found');

  const embeddingProvider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.id, embeddingModel.providerId),
  });
  if (!embeddingProvider?.enabled) {
    throw new DomainError('PROVIDER_DISABLED', 'Embedding provider is disabled');
  }

  const embedded = await createAiProviderAdapter(await providerRuntime(embeddingProvider.id)).embed({
    actionId: input.actionId,
    modelExternalId: embeddingModel.externalId,
    inputs: [input.question],
    expectedDimensions: generation.embeddingDimensions,
    abortSignal: new AbortController().signal,
  });

  const results = await retrieve(input.ctx, generation.id, embedded.vectors[0]!, 8);
  return {
    sources: searchResultsToSources(
      filterWikiQuestionResults(results, searchSettings.minRelevanceScore),
    ),
    usage: embedded.usage ?? {},
  };
}
