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
import { readableSpaces } from '@/server/services/public-content';
import { getSearchSettings } from '@/server/services/search-settings';
import {
  buildExcerpt,
  compareFusedCandidates,
  fuseCandidates,
  productionSearchEngineRegistry,
  projectReadableCandidatePages,
  type EngineContribution,
  type SearchCandidate,
  type SearchEngineOutcome,
} from '@/server/services/search';
import { loadReadableFullContext } from './full-context';

/**
 * Raw cosine noise floor for the semantic leg only, applied before fusion —
 * never compared against a lexical engine's own 0.3-1.0 heuristic scale (see
 * `toLexicalCandidate`). pgvector kNN always returns its nearest chunks even
 * when nothing in the corpus is actually close to the question, so this
 * guards against a fully-unrelated corpus leaking noise into the candidate
 * pool. Cross-engine relevance is instead decided by `fuseCandidates`'
 * reciprocal-rank fusion and, downstream, the shared `minRelevanceScore`
 * admin setting — never by comparing raw scores across engines.
 */
export const SEMANTIC_NOISE_FLOOR = 0.2;

/** Candidates requested per engine before fusion; final sources stay capped below. */
const CANDIDATE_POOL_LIMIT = 20;

/** Citations attached to one answer — bounds prompt size, unchanged from before. */
const SOURCE_LIMIT = 8;

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

export type WikiSearchOptions = {
  scope?: 'path' | 'title' | 'content' | 'all';
  space?: string;
  createdStart?: Date;
  createdEnd?: Date;
  order?: 'relevance' | 'createdAtAsc' | 'createdAtDesc' | 'updatedAtAsc' | 'updatedAtDesc';
  limit?: number;
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

/**
 * Converts grouped vector hits (already page-deduped and permission-checked
 * once by `retrieve()`) into the engine-agnostic candidate shape `fuseCandidates`
 * expects, applying the semantic-only noise floor first.
 */
function toSemanticCandidates(results: AiSearchResult[]): SearchCandidate[] {
  return results
    .filter((result) => result.score >= SEMANTIC_NOISE_FLOOR)
    .map((result, index) => ({
      pageId: result.pageId,
      revisionId: result.revisionId,
      rank: index,
      excerpt: result.excerpt,
      field: 'content' as const,
      compatRelevance: Math.max(-1, Math.min(1, result.score)),
    }));
}

function readyCandidates(outcome: SearchEngineOutcome): SearchCandidate[] {
  return outcome.state === 'ready' ? outcome.candidates : [];
}

export async function loadWikiQuestionSources(input: {
  ctx: PermCtx;
  actionId: string;
  question: string;
  mode: AiQuestionMode;
  textContextWindow: number | null;
  search?: WikiSearchOptions;
}): Promise<WikiQuestionSources> {
  if (input.mode === 'full') {
    return {
      sources: await loadReadableFullContext(input.ctx, input.textContextWindow, input.question),
      usage: {},
      results: [],
    };
  }

  // Same admin dials, same "every space this actor can read" resolution, and
  // the same engine adapters + RRF fusion + permission projection Search uses
  // (`apps/web/src/server/services/search/coordinator.ts`) — Wiki AI citations
  // and site Search results are found by one shared pipeline, not two.
  const settings = await getSearchSettings();
  const spaces = (await readableSpaces(input.ctx)).filter((space) => {
    if (!input.search?.space) return true;
    const requested = input.search.space === 'wiki' ? 'default' : input.search.space;
    return space.slug === requested;
  });
  const spaceIds = spaces.map((space) => space.id);
  const spaceSlugs = spaces.map((space) => space.slug);
  const searchLimit = Math.min(Math.max(input.search?.limit ?? SOURCE_LIMIT, 1), 100);
  const candidateLimit = Math.min(Math.max(searchLimit * 2, CANDIDATE_POOL_LIMIT), 50);
  const question = input.question.trim();

  const registry = productionSearchEngineRegistry();
  const engineQuery = {
    q: question,
    limit: candidateLimit,
    deadlineMs: settings.immediateSearchTimeoutMs,
    spaceIds,
    spaceSlugs,
  };

  const [fullTextOutcome, fuzzyOutcome] = await Promise.all([
    settings.fullTextSearchEnabled
      ? registry.get('full_text')!.run(input.ctx, engineQuery)
      : Promise.resolve<SearchEngineOutcome>({ state: 'unavailable' }),
    settings.fuzzySearchEnabled
      ? registry.get('fuzzy')!.run(input.ctx, engineQuery)
      : Promise.resolve<SearchEngineOutcome>({ state: 'unavailable' }),
  ]);

  let semanticCandidates: SearchCandidate[] = [];
  // chunkId only exists for a chunk-level (vector) hit — see aiCitationSchema.
  let chunkIdByPageId = new Map<string, string>();
  let retrievalUsage: Record<string, unknown> = {};
  let degradation: RetrievalDegradation | undefined;
  if (settings.semanticSearchEnabled) {
    try {
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
      const embedded: EmbeddingOutput = await embedQuestionWithRetries({
        actionId: input.actionId,
        question,
        modelExternalId: embeddingModel.externalId,
        expectedDimensions: generation.embeddingDimensions,
        providerId: embeddingProvider.id,
      });
      retrievalUsage = embedded.usage ?? {};
      // Captured conversations are excluded in SQL here (not in the shared
      // post-fusion filter below) because `limit` bounds the *chunk* window:
      // one production index held 886 conversation chunks that would
      // otherwise crowd out real content before fusion ever sees it. See
      // `exactCosineSearch`'s own docstring for the numbers.
      const semanticResults = await retrieve(input.ctx, generation.id, embedded.vectors[0]!, candidateLimit, {
        excludeCapturedConversations: true,
      });
      semanticCandidates = toSemanticCandidates(semanticResults);
      chunkIdByPageId = new Map(semanticResults.map((result) => [result.pageId, result.chunkId!]));
    } catch (error) {
      // RAG improves an answer but must not make the conversational agent or
      // search_wiki unavailable when its index/model/provider is incomplete or
      // its embedding endpoint fails: fall back to whatever full_text/fuzzy
      // already found instead of failing the whole turn.
      //
      // This deliberately does not gate on `retryable`: an upstream gateway
      // reports its own outage however it likes, and one returning HTTP 400 for
      // "circuit breaker is open" was classified INVALID_RESPONSE —
      // non-retryable — and killed the whole turn with "The AI could not
      // produce a valid Wiki operation. Retry or rephrase the request.", advice
      // no rephrasing could satisfy. A cancel still propagates: the user asked
      // for the turn to stop, not for a degraded one.
      if (error instanceof DomainError) {
        if (error.code === 'CANCELLED') throw error;
        degradation = { code: error.code };
        logger.warn('Wiki question semantic retrieval degraded before embedding', {
          actionId: input.actionId,
          errorCode: error.code,
        });
      } else {
        const normalized = normalizeProviderError(error);
        if (normalized.code === 'CANCELLED') throw normalized;
        degradation = { code: normalized.code };
        logger.warn('Wiki question semantic retrieval degraded after embedding retries', {
          actionId: input.actionId,
          errorCode: normalized.code,
        });
      }
    }
  }

  const contributions: EngineContribution[] = [
    // Semantic first so its richer, chunk-grounded excerpt wins the
    // "first non-null excerpt" tie-break in `fuseCandidates` over a shorter
    // lexical snippet, when both engines match the same page.
    { capability: 'semantic', candidates: semanticCandidates },
    { capability: 'full_text', candidates: readyCandidates(fullTextOutcome) },
    { capability: 'fuzzy', candidates: readyCandidates(fuzzyOutcome) },
  ];
  const fused = fuseCandidates(contributions);

  // The single permission boundary, shared with Search: a candidate that
  // survives fusion but isn't readable (restricted visibility, disallowed
  // space kind, etc.) never becomes a citation.
  const readable = await projectReadableCandidatePages(input.ctx, fused.map((candidate) => candidate.pageId), spaceIds);

  const scope = input.search?.scope ?? 'all';
  const scopedPageIds = scope === 'all'
    ? null
    : new Set(
        [fullTextOutcome, fuzzyOutcome, { state: 'ready' as const, candidates: semanticCandidates }]
          .flatMap((outcome) => outcome.state === 'ready' ? outcome.candidates : [])
          .filter((candidate) => candidate.field === scope)
          .map((candidate) => candidate.pageId),
      );
  const survivors = fused
    .filter((candidate) => {
      const entry = readable.get(candidate.pageId);
      if (!entry) return false;
      if (scopedPageIds && !scopedPageIds.has(candidate.pageId)) return false;
      // Captured conversations can only reach here via full_text/fuzzy (the
      // semantic leg already excludes them in SQL above); a Feishu-captured
      // conversation must never become the evidence for an answer.
      if (entry.page.rawCategorySystemKey === 'conversation') return false;
      if (input.search?.createdStart && new Date(entry.page.createdAt) < input.search.createdStart) return false;
      if (input.search?.createdEnd && new Date(entry.page.createdAt) > input.search.createdEnd) return false;
      const relevance = Math.max(-1, Math.min(1, candidate.compatRelevance));
      return relevance >= settings.minRelevanceScore;
    })
    .sort((a, b) => {
      const order = input.search?.order ?? 'relevance';
      if (order === 'createdAtAsc' || order === 'createdAtDesc' || order === 'updatedAtAsc' || order === 'updatedAtDesc') {
        const aPage = readable.get(a.pageId)!.page;
        const bPage = readable.get(b.pageId)!.page;
        const field: 'createdAt' | 'updatedAt' = order.startsWith('created') ? 'createdAt' : 'updatedAt';
        const direction = order.endsWith('Asc') ? 1 : -1;
        return direction * (new Date(aPage[field]).getTime() - new Date(bPage[field]).getTime())
          || aPage.path.localeCompare(bPage.path);
      }
      return compareFusedCandidates(a, b);
    })
    .slice(0, searchLimit);

  const results: AiSearchResult[] = survivors.map((candidate) => {
    const entry = readable.get(candidate.pageId)!;
    const excerpt = candidate.excerpt ?? buildExcerpt(entry.contentSource ?? '', question, 1200) ?? '';
    return {
      pageId: candidate.pageId,
      title: entry.page.title,
      path: entry.page.path,
      slug: entry.page.slug,
      locale: entry.page.locale,
      revisionId: entry.revisionId,
      revisionHash: entry.revisionHash,
      chunkId: chunkIdByPageId.get(candidate.pageId),
      excerpt,
      score: Math.max(-1, Math.min(1, candidate.compatRelevance)),
      spaceSlug: entry.page.spaceSlug,
      canonicalUrl: entry.page.canonicalUrl,
      rawCategorySystemKey: entry.page.rawCategorySystemKey ?? null,
    };
  });

  return {
    sources: searchResultsToSources(results),
    usage: retrievalUsage,
    results,
    ...(degradation ? { degradation } : {}),
  };
}

/**
 * Search tool entry point. It deliberately uses the same hybrid retrieval
 * implementation as Wiki AI's baseline sources, rather than the legacy
 * contiguous-ILIKE `content.searchPages` path. This keeps tool searches and
 * the header search aligned for Chinese, semantic, and cross-space queries.
 */
export async function searchWikiSources(input: {
  ctx: PermCtx;
  actionId: string;
  query: string;
  options?: WikiSearchOptions;
}): Promise<AiSearchResult[]> {
  const result = await loadWikiQuestionSources({
    ctx: input.ctx,
    actionId: input.actionId,
    question: input.query,
    mode: 'retrieval',
    textContextWindow: null,
    search: input.options,
  });
  return result.results;
}
