import type { PublicSemanticSearchAction } from '@next-wiki/shared';
import * as publicAi from '@/server/services/public-ai';
import type { SearchCandidate, SearchEngine } from '../types';

/**
 * Current `semantic` adapter: `pgvector` exact cosine retrieval behind the
 * existing durable AI-action lifecycle (P7). The engine never calls a model
 * inside the request handler — it either starts/resumes the persisted action
 * or reads its completed, permission-filtered results.
 */
export function createSemanticEngine(): SearchEngine {
  return {
    capability: 'semantic',
    async run(ctx, query) {
      const continuationRef = query.attempt?.continuationRef ?? null;

      if (!continuationRef) {
        // Without a durable attempt a pending action could never be resumed,
        // so semantic work is only started for persisted search records.
        if (!query.attempt) return { state: 'unavailable' };
        try {
          const accepted = await publicAi.submitSemanticSearch(ctx, {
            q: query.q,
            limit: query.limit,
            scope: 'all',
            // 023: a single requested space is passed through so semantic
            // retrieval doesn't fall back to the default wiki space (e.g.
            // Raw). With multiple spaces (the default, space-less search)
            // this stays undefined so the existing all-readable-spaces path
            // in ai-retrieval.ts covers every space in one query — never one
            // query per space.
            space: query.spaceSlugs.length === 1 ? query.spaceSlugs[0] : undefined,
          });
          return { state: 'pending', continuationRef: accepted.id };
        } catch {
          // AI disabled, index not ready, anonymous, or non-entitled actors:
          // a generic coverage state, never a diagnostic.
          return { state: 'unavailable' };
        }
      }

      try {
        const action = await publicAi.getSemanticSearchResults(ctx, continuationRef);
        if (action.status === 'succeeded') {
          return { state: 'ready', continuationRef, candidates: toCandidates(action.items ?? []) };
        }
        if (action.status === 'failed') return { state: 'failed' };
        if (action.status === 'expired') return { state: 'timed_out' };
        return { state: 'pending', continuationRef };
      } catch {
        return { state: 'unavailable' };
      }
    },
  };
}

function toCandidates(items: NonNullable<PublicSemanticSearchAction['items']>): SearchCandidate[] {
  return items.map((item, index) => ({
    pageId: item.pageId,
    revisionId: item.citations[0]?.revisionId,
    rank: index,
    excerpt: item.excerpt,
    field: 'content' as const,
    compatRelevance: Math.max(-1, Math.min(1, item.score)),
  }));
}
