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
  it('drops the long tail below half the best hit and preserves rank order', () => {
    // Cutoff is 0.41: the 0.41 hit is kept, the 0.39 one is not.
    const results = [result(0.82), result(0.6), result(0.41), result(0.39), result(0.12)];
    expect(filterWikiQuestionResults(results)).toEqual(results.slice(0, 3));
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

  it('does not let one outlier hit raise the bar above the rest of the corpus', () => {
    // Regression: a captured conversation scoring 0.795 for the question it was
    // captured from set a 0.7-ratio bar at 0.557 and excluded every real page.
    // Conversations no longer reach this filter, but no single hit should be
    // able to strangle a whole result set either.
    const results = [result(0.795), result(0.4549), result(0.4318), result(0.4095)];
    expect(filterWikiQuestionResults(results)).toEqual(results);
  });

  it('returns no sources when every candidate is unrelated', () => {
    expect(filterWikiQuestionResults([result(0.19), result(0.14)])).toEqual([]);
  });

  it('returns no sources for an empty candidate list', () => {
    expect(filterWikiQuestionResults([])).toEqual([]);
  });
});
