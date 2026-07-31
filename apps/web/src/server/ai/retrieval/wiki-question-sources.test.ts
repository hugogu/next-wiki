import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiSearchResult } from '@next-wiki/shared';
import { filterWikiQuestionResults } from './wiki-question-sources';

function result(score: number): AiSearchResult {
  return {
    pageId: randomUUID(),
    title: `Page ${score}`,
    path: `page-${score}`,
    locale: 'en',
    revisionId: randomUUID(),
    revisionHash: randomUUID().replaceAll('-', ''),
    chunkId: randomUUID(),
    excerpt: 'content',
    score,
    spaceSlug: 'default',
    rawCategorySystemKey: null,
  };
}

describe('Wiki question source relevance filtering', () => {
  it('keeps the hits competitive with the best one and preserves rank order', () => {
    const results = [result(0.82), result(0.6), result(0.57), result(0.12)];
    expect(filterWikiQuestionResults(results)).toEqual(results.slice(0, 2));
  });

  it('drops nothing when every candidate scores close to the top hit', () => {
    const results = [result(0.51), result(0.5), result(0.49)];
    expect(filterWikiQuestionResults(results)).toEqual(results);
  });

  it('keeps low-cosine hits that an embedding model simply never scores higher', () => {
    // Regression: an absolute 0.5 cutoff discarded every real Wiki page for a
    // model whose relevant scores top out near 0.51, leaving only a captured
    // conversation at 0.65 as the answer's evidence.
    const results = [result(0.6505), result(0.5112), result(0.5109), result(0.4988)];
    expect(filterWikiQuestionResults(results)).toEqual(results);
  });

  it('returns no sources when every candidate is unrelated', () => {
    expect(filterWikiQuestionResults([result(0.19), result(0.14)])).toEqual([]);
  });

  it('returns no sources for an empty candidate list', () => {
    expect(filterWikiQuestionResults([])).toEqual([]);
  });
});
