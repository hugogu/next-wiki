import { describe, expect, it } from 'vitest';
import { compareFusedCandidates, exactMatchTier, fuseCandidates, RRF_K } from './ranking';
import type { SearchCandidate } from './types';

function candidate(pageId: string, rank: number, overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  return { pageId, rank, ...overrides };
}

describe('rank fusion', () => {
  it('de-duplicates by page identity and merges capability provenance', () => {
    const fused = fuseCandidates([
      { capability: 'full_text', candidates: [candidate('page-a', 0), candidate('page-b', 1)] },
      { capability: 'fuzzy', candidates: [candidate('page-a', 0)] },
      { capability: 'semantic', candidates: [candidate('page-a', 0, { excerpt: 'semantic excerpt' })] },
    ]);

    expect(fused).toHaveLength(2);
    const pageA = fused.find((entry) => entry.pageId === 'page-a')!;
    expect(pageA.engineSources).toEqual(['full_text', 'fuzzy', 'semantic']);
    // Three rank-0 contributions accumulate reciprocal-rank scores.
    expect(pageA.score).toBeCloseTo(3 / (RRF_K + 1), 10);
    expect(pageA.excerpt).toBe('semantic excerpt');
  });

  it('fuses engine-local rank positions, never native scores', () => {
    const fused = fuseCandidates([
      // compatRelevance deliberately contradicts rank order: rank must win.
      { capability: 'full_text', candidates: [candidate('first', 0, { compatRelevance: 0.1 }), candidate('second', 1, { compatRelevance: 0.99 })] },
    ]);
    expect(fused.map((entry) => entry.pageId)).toEqual(['first', 'second']);
    expect(fused[0]!.score).toBeGreaterThan(fused[1]!.score);
  });

  it('protects exact path, title, and term matches over otherwise comparable approximate matches', () => {
    const fused = fuseCandidates([
      {
        capability: 'fuzzy',
        candidates: [
          candidate('approximate', 0),
          candidate('exact-term', 1, { exact: { term: true } }),
          candidate('exact-title', 2, { exact: { title: true } }),
          candidate('exact-path', 3, { exact: { path: true } }),
        ],
      },
    ]);
    expect(fused.map((entry) => entry.pageId)).toEqual(['exact-path', 'exact-title', 'exact-term', 'approximate']);
  });

  it('keeps the highest exact tier when engines disagree about the same page', () => {
    const fused = fuseCandidates([
      { capability: 'full_text', candidates: [candidate('page-a', 0, { exact: { path: true } })] },
      { capability: 'semantic', candidates: [candidate('page-a', 0)] },
    ]);
    expect(fused[0]!.exactTier).toBe(3);
  });

  it('orders deterministically: exact tier, fused score, then page id', () => {
    const a = { pageId: 'a', score: 0.1, exactTier: 0, engineSources: [], excerpt: null, compatRelevance: 0 } as const;
    const b = { pageId: 'b', score: 0.1, exactTier: 0, engineSources: [], excerpt: null, compatRelevance: 0 } as const;
    expect(compareFusedCandidates({ ...a }, { ...b })).toBeLessThan(0);
    expect(compareFusedCandidates({ ...a, score: 0.05 }, { ...b })).toBeGreaterThan(0);
    expect(compareFusedCandidates({ ...a, exactTier: 1, score: 0.01 }, { ...b })).toBeLessThan(0);
  });

  it('keeps the highest compatibility relevance and first excerpt evidence', () => {
    const fused = fuseCandidates([
      { capability: 'full_text', candidates: [candidate('page-a', 0, { compatRelevance: 0.4, excerpt: 'lexical excerpt' })] },
      { capability: 'semantic', candidates: [candidate('page-a', 0, { compatRelevance: 0.9, excerpt: 'semantic excerpt' })] },
    ]);
    expect(fused[0]!.compatRelevance).toBe(0.9);
    expect(fused[0]!.excerpt).toBe('lexical excerpt');
  });

  it('classifies exact tiers', () => {
    expect(exactMatchTier({ exact: { path: true } })).toBe(3);
    expect(exactMatchTier({ exact: { title: true } })).toBe(2);
    expect(exactMatchTier({ exact: { term: true } })).toBe(1);
    expect(exactMatchTier({})).toBe(0);
  });
});
