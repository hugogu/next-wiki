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
import { loadReadableFullContext } from './full-context';

/**
 * Retrieval cutoff, relative to the best hit of the same query.
 *
 * This deliberately does NOT reuse the admin `minRelevanceScore` dial. That
 * number grades keyword matches on a hand-assigned scale (`scoreSearchMatch`:
 * 0.95 for a path match, 0.8 for a title match, 0.3–0.7 for content), while
 * vector hits are raw cosine similarity — the two are not the same
 * measurement, and an embedding model's absolute cosine range is a property of
 * the model, not of the corpus or of the operator's intent.
 *
 * Setting the dial to 0.5 for keyword search silently made semantic retrieval
 * useless: with `perplexity/pplx-embed-v1-0.6b` the genuinely relevant pages
 * for one question topped out at ~0.51, so 7 of 8 candidates were discarded
 * and the single survivor was an unrelated-but-verbatim captured conversation
 * at 0.65. A ratio against the top hit expresses the intent that survived that
 * incident — "keep what is nearly as good as the best match" — without
 * encoding any one model's scale.
 */
export const RELATIVE_SCORE_FLOOR = 0.7;

/**
 * Absolute floor below which nothing is a source at any ratio.
 *
 * Only guards the case where the whole corpus is unrelated to the question: a
 * top hit of 0.2 must not drag in a tail at 0.14 as "evidence". Kept far below
 * any plausible relevant score so it never becomes the effective cutoff.
 */
export const ABSOLUTE_SCORE_FLOOR = 0.2;

/**
 * Keep the hits that are competitive with the best one. `results` arrive sorted
 * by descending score from `retrieve()`; rank order is preserved.
 */
export function filterWikiQuestionResults(results: AiSearchResult[]): AiSearchResult[] {
  const best = results[0]?.score ?? 0;
  const cutoff = Math.max(best * RELATIVE_SCORE_FLOOR, ABSOLUTE_SCORE_FLOOR);
  return results.filter((result) => result.score >= cutoff);
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

  const generation = await db.query.aiIndexGenerations.findFirst({
    where: eq(schema.aiIndexGenerations.isActive, true),
  });
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
    // unavailable when its embedding endpoint fails. The deterministic setup
    // errors (missing index/model/provider) are thrown above, outside this
    // try, so everything caught here is a failure of the embedding call
    // itself and degrades to an unretrieved answer.
    //
    // This deliberately does not gate on `retryable`: an upstream gateway
    // reports its own outage however it likes, and one returning HTTP 400 for
    // "circuit breaker is open" was classified INVALID_RESPONSE —
    // non-retryable — and killed the whole turn with "The AI could not
    // produce a valid Wiki operation. Retry or rephrase the request.", advice
    // no rephrasing could satisfy. A cancel still propagates: the user asked
    // for the turn to stop, not for a degraded one.
    if (normalized.code === 'CANCELLED') throw normalized;
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
  const filtered = filterWikiQuestionResults(results);
  return {
    sources: searchResultsToSources(filtered),
    usage: embedded.usage ?? {},
    results: filtered,
  };
}
