import type { SearchCapabilityId } from '@next-wiki/shared';
import type { SearchCandidate } from './types';

/**
 * Reciprocal-rank-fusion constant shared with feature 013. Only engine-local
 * rank positions are combined — native scores are never compared across
 * engines because their scales carry different meanings (Decision 5).
 */
export const RRF_K = 60;

export type EngineContribution = {
  capability: SearchCapabilityId;
  candidates: readonly SearchCandidate[];
};

/** 3 = exact path, 2 = exact title, 1 = exact term, 0 = approximate only. */
export function exactMatchTier(candidate: Pick<SearchCandidate, 'exact'>): number {
  if (candidate.exact?.path) return 3;
  if (candidate.exact?.title) return 2;
  if (candidate.exact?.term) return 1;
  return 0;
}

export type FusedCandidate = {
  pageId: string;
  revisionId?: string;
  /** Sum of reciprocal-rank contributions across engines. */
  score: number;
  /** Deterministic exact-match protection tier (highest across engines). */
  exactTier: number;
  /** Stable capability provenance in contribution order. */
  engineSources: SearchCapabilityId[];
  /** First non-null excerpt evidence across engines, if any. */
  excerpt: string | null;
  field?: SearchCandidate['field'];
  /** Highest compatibility display relevance across engines. */
  compatRelevance: number;
};

/**
 * De-duplicates candidates by page identity and fuses engine-local ranks with
 * weighted reciprocal rank. The result is fully ordered: exact path/title/term
 * matches deterministically precede otherwise comparable approximate
 * candidates (FR-007), then fused score, then page id for a stable total order.
 */
export function fuseCandidates(contributions: readonly EngineContribution[]): FusedCandidate[] {
  const merged = new Map<string, FusedCandidate>();

  for (const { capability, candidates } of contributions) {
    const ordered = [...candidates].sort((a, b) => a.rank - b.rank);
    for (const [position, candidate] of ordered.entries()) {
      const contribution = 1 / (RRF_K + position + 1);
      const tier = exactMatchTier(candidate);
      const current = merged.get(candidate.pageId);
      if (!current) {
        merged.set(candidate.pageId, {
          pageId: candidate.pageId,
          revisionId: candidate.revisionId,
          score: contribution,
          exactTier: tier,
          engineSources: [capability],
          excerpt: candidate.excerpt ?? null,
          field: candidate.field,
          compatRelevance: candidate.compatRelevance ?? 0,
        });
        continue;
      }
      current.score += contribution;
      current.exactTier = Math.max(current.exactTier, tier);
      if (!current.engineSources.includes(capability)) current.engineSources.push(capability);
      if (current.excerpt === null && candidate.excerpt) current.excerpt = candidate.excerpt;
      current.field ??= candidate.field;
      current.compatRelevance = Math.max(current.compatRelevance, candidate.compatRelevance ?? 0);
      current.revisionId ??= candidate.revisionId;
    }
  }

  return [...merged.values()].sort(compareFusedCandidates);
}

type ComparableFusedCandidate = Pick<FusedCandidate, 'pageId' | 'score' | 'exactTier'>;

export function compareFusedCandidates(a: ComparableFusedCandidate, b: ComparableFusedCandidate): number {
  return b.exactTier - a.exactTier || b.score - a.score || a.pageId.localeCompare(b.pageId);
}
