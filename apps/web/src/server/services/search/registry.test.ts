import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS } from '@next-wiki/shared';
import { closeDb } from '@/server/db';
import { ensurePublicApiDefaultSpace } from '../../../../test/public-wiki-api-fixtures';
import { runCoordinatedSearch } from './coordinator';
import { createSearchEngineRegistry } from './registry';
import { createSearchFixtureCorpus } from './test-support';
import type { SearchEngine, SearchEngineOutcome } from './types';

function replacementEngine(capability: SearchEngine['capability'], outcome: SearchEngineOutcome): SearchEngine {
  return { capability, run: async () => outcome };
}

describe('search engine registry', () => {
  it('accepts a replacement adapter with ready, pending, and failed outcomes without changing coordinator contracts', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`registry-${randomUUID().slice(0, 8)}`);
    const registry = createSearchEngineRegistry([
      replacementEngine('full_text', {
        state: 'ready',
        candidates: [{ pageId: corpus.pages.english.pageId, rank: 0, compatRelevance: 0.8 }],
      }),
      replacementEngine('fuzzy', { state: 'pending', continuationRef: 'replacement-work-1' }),
      replacementEngine('semantic', { state: 'failed' }),
    ]);

    const snapshot = await runCoordinatedSearch(corpus.readerCtx, {
      q: 'replacement adapter',
      limit: 20,
      snapshot: { full_text: true, fuzzy: true, semantic: true },
      excerpt: { windowSize: 120, show: true },
      minRelevanceScore: 0,
      immediateSearchTimeoutMs: DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS,
    }, registry);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      page: { id: corpus.pages.english.pageId },
      engineSources: ['full_text'],
      matchSources: ['keyword'],
    });
    expect(snapshot.engineStates).toEqual([
      { capability: 'full_text', state: 'ready', resultCount: 1 },
      { capability: 'fuzzy', state: 'pending', resultCount: 0 },
      { capability: 'semantic', state: 'failed', resultCount: 0 },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('replacement-work-1');
  });

  it('rejects duplicate capability registrations', () => {
    const fullText = replacementEngine('full_text', { state: 'ready', candidates: [] });
    expect(() => createSearchEngineRegistry([fullText, fullText])).toThrow('Duplicate search engine registration');
  });
});

afterAll(async () => {
  await closeDb();
});
