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
  it('keeps only results at or above the configured threshold and preserves rank order', () => {
    const results = [result(0.82), result(0.5), result(0.49), result(0.12)];
    expect(filterWikiQuestionResults(results, 0.5)).toEqual(results.slice(0, 2));
  });

  it('returns no sources when every candidate is unrelated', () => {
    expect(filterWikiQuestionResults([result(0.31), result(0.2)], 0.5)).toEqual([]);
  });
});
