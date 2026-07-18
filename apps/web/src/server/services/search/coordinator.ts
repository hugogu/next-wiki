import type {
  HybridSearchEngineState,
  HybridSearchSemanticState,
  PublicPageResource,
  SearchCapabilityId,
  SearchEngineRunState,
} from '@next-wiki/shared';
import type { PermCtx } from '@/server/permissions';
import * as searchAnalytics from '@/server/services/search-analytics';
import { buildExcerpt, compactExcerpt, projectReadableCandidatePages } from './candidate-projection';
import { fuseCandidates, type EngineContribution } from './ranking';
import { productionSearchEngineRegistry, type SearchEngineRegistry } from './registry';
import {
  SEARCH_CAPABILITY_IDS,
  isTerminalRunState,
  type CapabilitySnapshot,
  type SearchEngineOutcome,
} from './types';

export type CoordinatedSearchInput = {
  /** Normalized (trimmed) query shared by every enabled capability. */
  q: string;
  /** Bounded UI result limit (feature 013: at most 20). */
  limit: number;
  /** Capability set for this attempt — the record snapshot for retries, current settings otherwise. */
  snapshot: CapabilitySnapshot;
  excerpt: { windowSize: number; show: boolean };
  minRelevanceScore: number;
  /** Administrator-controlled database budget for each immediate lexical engine. */
  immediateSearchTimeoutMs: number;
  /** Resolved content space for every engine and the permission projection. */
  spaceId?: string;
  /**
   * Durable attempt identity. When present the coordinator creates/resumes one
   * run per enabled capability and lets the semantic engine start or resume
   * its asynchronous action. Without it, only work that completes in-request
   * is possible and nothing is persisted.
   */
  attempt?: { searchRecordId: string };
};

export type CoordinatedResultItem = {
  page: PublicPageResource;
  excerpt: string | null;
  /** Fused reciprocal-rank score. Not comparable to legacy GET scores. */
  score: number;
  /** Feature-013 compatibility display value. */
  relevanceScore: number;
  matchSources: Array<'keyword' | 'semantic'>;
  engineSources: SearchCapabilityId[];
  /** Product-level matched-field evidence for legacy projections. */
  field: 'path' | 'title' | 'content';
};

export type CoordinatedSearchSnapshot = {
  engineStates: HybridSearchEngineState[];
  items: CoordinatedResultItem[];
  /** Feature-013 compatibility mirror of the semantic capability. */
  semanticState: HybridSearchSemanticState;
  semanticContinuationRef: string | null;
  /** Unique readable pages contributed by lexical capabilities (analytics compat). */
  keywordReadableCount: number;
  semanticReadableCount: number;
};

/**
 * Owns the whole retrieval lifecycle: capability enablement, concurrent
 * engine execution, durable run resume, central permission projection, rank
 * fusion, and safe state mapping. Engines never format responses; routes and
 * `public-content.ts` never see SQL, vectors, or providers (FR-013).
 */
export async function runCoordinatedSearch(
  ctx: PermCtx,
  input: CoordinatedSearchInput,
  registry: SearchEngineRegistry = productionSearchEngineRegistry(),
): Promise<CoordinatedSearchSnapshot> {
  const enabled = SEARCH_CAPABILITY_IDS.filter((id) => input.snapshot[id]);

  const runsByCapability = new Map<SearchCapabilityId, searchAnalytics.SearchEngineRunRow>();
  if (input.attempt) {
    const runs = await searchAnalytics.ensureEngineRuns(input.attempt.searchRecordId, input.snapshot);
    for (const run of runs) runsByCapability.set(run.capabilityId, run);
  }

  // Every enabled capability starts together (FR-003); one engine's failure
  // never suppresses another's completed results (FR-008).
  const outcomes = new Map<SearchCapabilityId, SearchEngineOutcome>();
  const settled = await Promise.allSettled(
    enabled.map((capability) => executeEngine(ctx, registry, capability, input, runsByCapability.get(capability))),
  );
  enabled.forEach((capability, index) => {
    const result = settled[index]!;
    if (result.status === 'fulfilled') {
      outcomes.set(capability, result.value);
    } else {
      console.error(`Search engine ${capability} threw:`, result.reason);
      outcomes.set(capability, { state: 'failed' });
    }
  });

  const contributions: EngineContribution[] = [];
  for (const capability of enabled) {
    const outcome = outcomes.get(capability)!;
    if (outcome.state === 'ready') contributions.push({ capability, candidates: outcome.candidates });
  }

  const fused = fuseCandidates(contributions);
  // The single visibility boundary: unreadable candidates vanish before any
  // count, excerpt, or fused result exists (FR-006).
  const readable = await projectReadableCandidatePages(ctx, fused.map((candidate) => candidate.pageId), input.spaceId);

  const readableCounts = new Map<SearchCapabilityId, number>();
  for (const { capability, candidates } of contributions) {
    readableCounts.set(capability, new Set(candidates.filter((c) => readable.has(c.pageId)).map((c) => c.pageId)).size);
  }

  const items = fused
    .filter((candidate) => readable.has(candidate.pageId))
    .map((candidate) => {
      const entry = readable.get(candidate.pageId)!;
      const rawExcerpt = candidate.excerpt
        ?? (entry.contentSource ? buildExcerpt(entry.contentSource, input.q, input.excerpt.windowSize * 2) : null);
      return {
        page: entry.page,
        excerpt: compactExcerpt(rawExcerpt, input.q, input.excerpt.windowSize, input.excerpt.show),
        score: candidate.score,
        relevanceScore: Math.max(-1, Math.min(1, candidate.compatRelevance)),
        matchSources: conceptualSources(candidate.engineSources),
        engineSources: candidate.engineSources,
        field: candidate.field ?? 'content',
        exactTier: candidate.exactTier,
      };
    })
    .filter((item) => item.relevanceScore >= input.minRelevanceScore)
    .sort((a, b) => b.exactTier - a.exactTier || b.score - a.score || a.page.path.localeCompare(b.page.path))
    .slice(0, input.limit)
    .map(({ exactTier: _exactTier, ...item }) => item);

  const engineStates: HybridSearchEngineState[] = SEARCH_CAPABILITY_IDS
    .map((capability) => {
      if (!input.snapshot[capability]) return { capability, state: 'skipped' as const, resultCount: 0 };
      const outcome = outcomes.get(capability)!;
      return {
        capability,
        state: outcome.state,
        resultCount: outcome.state === 'ready' ? readableCounts.get(capability) ?? 0 : 0,
      };
    });

  if (input.attempt) {
    await persistRunTransitions(input.attempt.searchRecordId, enabled, outcomes, readableCounts);
  }

  const semanticOutcome = outcomes.get('semantic');
  const semanticContinuationRef =
    (semanticOutcome && 'continuationRef' in semanticOutcome ? semanticOutcome.continuationRef : null)
    ?? runsByCapability.get('semantic')?.continuationRef
    ?? null;

  return {
    engineStates,
    items,
    semanticState: toCompatSemanticState(input.snapshot, semanticOutcome?.state),
    semanticContinuationRef,
    keywordReadableCount: uniqueReadableCount(contributions, readable, ['full_text', 'fuzzy']),
    semanticReadableCount: readableCounts.get('semantic') ?? 0,
  };
}

async function executeEngine(
  ctx: PermCtx,
  registry: SearchEngineRegistry,
  capability: SearchCapabilityId,
  input: CoordinatedSearchInput,
  run: searchAnalytics.SearchEngineRunRow | undefined,
): Promise<SearchEngineOutcome> {
  const engine = registry.get(capability);
  if (!engine) return { state: 'unavailable' };

  // A semantic run that already ended without a continuation stays ended:
  // an idempotent retry must not silently start new provider work.
  if (
    capability === 'semantic'
    && run
    && isTerminalRunState(run.state)
    && run.state !== 'ready'
    && !run.continuationRef
  ) {
    return { state: run.state as Exclude<SearchEngineRunState, 'ready' | 'pending' | 'skipped'> };
  }

  return engine.run(ctx, {
    q: input.q,
    limit: input.limit,
    deadlineMs: input.immediateSearchTimeoutMs,
    spaceId: input.spaceId,
    attempt: input.attempt
      ? { searchRecordId: input.attempt.searchRecordId, continuationRef: run?.continuationRef ?? null }
      : undefined,
  });
}

async function persistRunTransitions(
  searchRecordId: string,
  enabled: readonly SearchCapabilityId[],
  outcomes: ReadonlyMap<SearchCapabilityId, SearchEngineOutcome>,
  readableCounts: ReadonlyMap<SearchCapabilityId, number>,
): Promise<void> {
  await Promise.all(enabled.map(async (capability) => {
    const outcome = outcomes.get(capability)!;
    try {
      await searchAnalytics.updateEngineRun(searchRecordId, capability, {
        state: outcome.state,
        resultCount: outcome.state === 'ready' ? readableCounts.get(capability) ?? 0 : 0,
        ...('continuationRef' in outcome && outcome.continuationRef !== undefined
          ? { continuationRef: outcome.continuationRef }
          : {}),
      });
    } catch (error) {
      // Run bookkeeping must never turn readable results into a failed search.
      console.error(`Failed to persist ${capability} search run transition:`, error);
    }
  }));
}

function conceptualSources(engineSources: readonly SearchCapabilityId[]): Array<'keyword' | 'semantic'> {
  const sources: Array<'keyword' | 'semantic'> = [];
  if (engineSources.some((source) => source === 'full_text' || source === 'fuzzy')) sources.push('keyword');
  if (engineSources.includes('semantic')) sources.push('semantic');
  return sources;
}

/** Maps the semantic capability outcome to feature-013 vocabulary; timed_out becomes failed. */
function toCompatSemanticState(
  snapshot: CapabilitySnapshot,
  state: SearchEngineRunState | undefined,
): HybridSearchSemanticState {
  if (!snapshot.semantic) return 'skipped';
  if (!state || state === 'timed_out') return state ? 'failed' : 'unavailable';
  if (state === 'skipped') return 'skipped';
  return state;
}

function uniqueReadableCount(
  contributions: readonly EngineContribution[],
  readable: ReadonlyMap<string, unknown>,
  capabilities: readonly SearchCapabilityId[],
): number {
  const pages = new Set<string>();
  for (const { capability, candidates } of contributions) {
    if (!capabilities.includes(capability)) continue;
    for (const candidate of candidates) {
      if (readable.has(candidate.pageId)) pages.add(candidate.pageId);
    }
  }
  return pages.size;
}
