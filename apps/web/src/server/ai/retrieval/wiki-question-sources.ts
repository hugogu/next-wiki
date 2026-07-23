import { eq } from 'drizzle-orm';
import type { AiQuestionMode, AiSearchResult } from '@next-wiki/shared';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { searchResultsToSources, type QuestionSource } from '@/server/ai/prompts/wiki-question';
import { AiProviderError, normalizeProviderError, type EmbeddingOutput } from '@/server/ai/types';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { logger } from '@/server/logger';
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

const QUERY_EMBEDDING_MAX_ATTEMPTS = 3;
const QUERY_EMBEDDING_RETRY_DELAYS_MS = [250, 750];

type RetrievalDegradation = {
  code: string;
};

type WikiQuestionSources = {
  sources: QuestionSource[];
  usage: Record<string, unknown>;
  /** Raw retrieval hits after score filtering; feeds the search_results event. */
  results: AiSearchResult[];
  degradation?: RetrievalDegradation;
};

function waitForEmbeddingRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, QUERY_EMBEDDING_RETRY_DELAYS_MS[attempt] ?? 0));
}

async function embedQuestionWithRetries(input: {
  actionId: string;
  question: string;
  modelExternalId: string;
  expectedDimensions: number;
  providerId: string;
}) {
  let lastError: AiProviderError | null = null;
  for (let attempt = 0; attempt < QUERY_EMBEDDING_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await createAiProviderAdapter(await providerRuntime(input.providerId)).embed({
        actionId: input.actionId,
        modelExternalId: input.modelExternalId,
        inputs: [input.question],
        expectedDimensions: input.expectedDimensions,
        abortSignal: new AbortController().signal,
      });
    } catch (error) {
      const normalized = normalizeProviderError(error);
      lastError = normalized;
      if (!normalized.retryable || attempt === QUERY_EMBEDDING_MAX_ATTEMPTS - 1) throw normalized;
      await waitForEmbeddingRetry(attempt);
    }
  }
  throw lastError ?? new AiProviderError('PROVIDER_UNAVAILABLE', 'Embedding provider is unavailable', true);
}

export async function loadWikiQuestionSources(input: {
  ctx: PermCtx;
  actionId: string;
  question: string;
  mode: AiQuestionMode;
  textContextWindow: number | null;
}): Promise<WikiQuestionSources> {
  if (input.mode === 'full') {
    return {
      sources: await loadReadableFullContext(input.ctx, input.textContextWindow, input.question),
      usage: {},
      results: [],
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

  let embedded: EmbeddingOutput;
  try {
    embedded = await embedQuestionWithRetries({
      actionId: input.actionId,
      question: input.question,
      modelExternalId: embeddingModel.externalId,
      expectedDimensions: generation.embeddingDimensions,
      providerId: embeddingProvider.id,
    });
  } catch (error) {
    const normalized = normalizeProviderError(error);
    // RAG improves an answer but must not make the conversational agent
    // unavailable when its embedding endpoint has a transient outage. Keep
    // deterministic setup errors (missing index/model/provider) above as hard
    // failures; only a retryable provider failure is allowed to degrade.
    if (!normalized.retryable) throw normalized;
    logger.warn('Wiki question retrieval degraded after embedding retries', {
      actionId: input.actionId,
      errorCode: normalized.code,
    });
    return {
      sources: [],
      usage: { retrieval: { status: 'unavailable', errorCode: normalized.code } },
      results: [],
      degradation: { code: normalized.code },
    };
  }

  const results = await retrieve(input.ctx, generation.id, embedded.vectors[0]!, 8);
  const filtered = filterWikiQuestionResults(results, searchSettings.minRelevanceScore);
  return {
    sources: searchResultsToSources(filtered),
    usage: embedded.usage ?? {},
    results: filtered,
  };
}
