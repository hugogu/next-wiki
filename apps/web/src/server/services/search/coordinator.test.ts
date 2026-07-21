import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS, type SearchCapabilityId } from '@next-wiki/shared';
import { closeDb } from '@/server/db';
import { buildAnonymousCtx } from '@/server/permissions';
import * as searchAnalytics from '@/server/services/search-analytics';
import { ensurePublicApiDefaultSpace } from '../../../../test/public-wiki-api-fixtures';
import { runCoordinatedSearch, type CoordinatedSearchInput } from './coordinator';
import { createSearchEngineRegistry } from './registry';
import type { SearchCandidate, SearchEngine, SearchEngineOutcome, SearchEngineQuery } from './types';
import { createSearchFixtureCorpus, type SearchFixtureCorpus } from './test-support';

const ALL_ENABLED = { full_text: true, fuzzy: true, semantic: true };

function fakeEngine(
  capability: SearchCapabilityId,
  behavior: (query: SearchEngineQuery) => Promise<SearchEngineOutcome> | SearchEngineOutcome,
): SearchEngine & { calls: SearchEngineQuery[] } {
  const calls: SearchEngineQuery[] = [];
  return {
    capability,
    calls,
    async run(_ctx, query) {
      calls.push(query);
      return behavior(query);
    },
  };
}

function readyWith(candidates: SearchCandidate[]): SearchEngineOutcome {
  return { state: 'ready', candidates };
}

async function baseInput(q: string, overrides: Partial<CoordinatedSearchInput> = {}): Promise<CoordinatedSearchInput> {
  const space = await ensurePublicApiDefaultSpace();
  return {
    q,
    limit: 20,
    snapshot: ALL_ENABLED,
    excerpt: { windowSize: 120, show: true },
    minRelevanceScore: 0,
    immediateSearchTimeoutMs: DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS,
    spaceIds: [space!.id],
    spaceSlugs: [space!.slug],
    ...overrides,
  };
}

async function createAttempt(corpus: SearchFixtureCorpus, q: string) {
  const space = await ensurePublicApiDefaultSpace();
  const record = await searchAnalytics.getOrCreateSearchRecord(
    buildAnonymousCtx(),
    { kind: 'query', searchRecordId: randomUUID(), searchSessionId: randomUUID(), q, limit: 20 },
    space!.id,
    { keywordResultCount: 0, semanticResultCount: 0, resultCount: 0, semanticState: 'skipped' },
    ALL_ENABLED,
  );
  return record;
}

describe('search coordinator', () => {
  it('starts every enabled capability concurrently, not serially (FR-003)', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-conc-${randomUUID().slice(0, 8)}`);
    const events: string[] = [];
    const slow = (capability: SearchCapabilityId) => fakeEngine(capability, async () => {
      events.push(`${capability}:start`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      events.push(`${capability}:end`);
      return readyWith([]);
    });
    const registry = createSearchEngineRegistry([slow('full_text'), slow('fuzzy'), slow('semantic')]);

    await runCoordinatedSearch(corpus.readerCtx, await baseInput('anything'), registry);

    // Serial execution would interleave start/end pairs; concurrent starts all come first.
    expect(events.slice(0, 3).sort()).toEqual(['full_text:start', 'fuzzy:start', 'semantic:start']);
  });

  it('fuses ready contributions, de-duplicates by page, and reports per-capability readable counts', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-fuse-${randomUUID().slice(0, 8)}`);
    const registry = createSearchEngineRegistry([
      fakeEngine('full_text', () => readyWith([
        { pageId: corpus.pages.english.pageId, rank: 0, exact: { term: true }, compatRelevance: 0.7 },
      ])),
      fakeEngine('fuzzy', () => readyWith([
        { pageId: corpus.pages.english.pageId, rank: 0, compatRelevance: 0.5 },
        { pageId: corpus.pages.chinese.pageId, rank: 1, compatRelevance: 0.4 },
      ])),
      fakeEngine('semantic', () => readyWith([
        { pageId: corpus.pages.semantic.pageId, rank: 0, excerpt: 'conceptual excerpt', compatRelevance: 0.9 },
      ])),
    ]);

    const snapshot = await runCoordinatedSearch(corpus.readerCtx, await baseInput('anything'), registry);

    expect(snapshot.items.map((item) => item.page.id)).toEqual([
      corpus.pages.english.pageId, // exact term protection + two contributions
      corpus.pages.semantic.pageId,
      corpus.pages.chinese.pageId,
    ]);
    const english = snapshot.items[0]!;
    expect(english.engineSources).toEqual(['full_text', 'fuzzy']);
    expect(english.matchSources).toEqual(['keyword']);
    const semantic = snapshot.items[1]!;
    expect(semantic.matchSources).toEqual(['semantic']);
    expect(semantic.excerpt).toBe('conceptual excerpt');
    expect(snapshot.engineStates).toEqual([
      { capability: 'full_text', state: 'ready', resultCount: 1 },
      { capability: 'fuzzy', state: 'ready', resultCount: 2 },
      { capability: 'semantic', state: 'ready', resultCount: 1 },
    ]);
    expect(snapshot.keywordReadableCount).toBe(2);
    expect(snapshot.semanticReadableCount).toBe(1);
  });

  it('filters every candidate through the central permission projection before any count or excerpt', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-perm-${randomUUID().slice(0, 8)}`);
    const registry = createSearchEngineRegistry([
      fakeEngine('full_text', () => readyWith([
        { pageId: corpus.pages.hiddenDraft.pageId, rank: 0, excerpt: 'CONFIDENTIALSEARCHTOKEN evidence', compatRelevance: 1 },
        { pageId: corpus.pages.english.pageId, rank: 1, compatRelevance: 0.5 },
      ])),
    ]);

    const snapshot = await runCoordinatedSearch(
      corpus.readerCtx,
      await baseInput('anything', { snapshot: { full_text: true, fuzzy: false, semantic: false } }),
      registry,
    );

    expect(snapshot.items.map((item) => item.page.id)).toEqual([corpus.pages.english.pageId]);
    expect(snapshot.engineStates).toContainEqual({ capability: 'full_text', state: 'ready', resultCount: 1 });
    expect(JSON.stringify(snapshot)).not.toContain('CONFIDENTIALSEARCHTOKEN');
  });

  it('keeps completed results when another capability fails, without exposing diagnostics (FR-008)', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-fail-${randomUUID().slice(0, 8)}`);
    const registry = createSearchEngineRegistry([
      fakeEngine('full_text', () => readyWith([{ pageId: corpus.pages.english.pageId, rank: 0, compatRelevance: 0.7 }])),
      fakeEngine('fuzzy', () => {
        throw new Error('connection refused at 10.0.0.5:5432');
      }),
      fakeEngine('semantic', () => ({ state: 'timed_out' })),
    ]);

    const snapshot = await runCoordinatedSearch(corpus.readerCtx, await baseInput('anything'), registry);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.engineStates).toEqual([
      { capability: 'full_text', state: 'ready', resultCount: 1 },
      { capability: 'fuzzy', state: 'failed', resultCount: 0 },
      { capability: 'semantic', state: 'timed_out', resultCount: 0 },
    ]);
    // timed_out maps to the feature-013 failed vocabulary.
    expect(snapshot.semanticState).toBe('failed');
    expect(JSON.stringify(snapshot)).not.toContain('10.0.0.5');
  });

  it('marks disabled capabilities skipped from the immutable snapshot without invoking them', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-skip-${randomUUID().slice(0, 8)}`);
    const fuzzy = fakeEngine('fuzzy', () => readyWith([]));
    const registry = createSearchEngineRegistry([
      fakeEngine('full_text', () => readyWith([])),
      fuzzy,
      fakeEngine('semantic', () => readyWith([])),
    ]);

    const snapshot = await runCoordinatedSearch(
      corpus.readerCtx,
      await baseInput('anything', { snapshot: { full_text: true, fuzzy: false, semantic: false } }),
      registry,
    );

    expect(fuzzy.calls).toHaveLength(0);
    expect(snapshot.engineStates).toContainEqual({ capability: 'fuzzy', state: 'skipped', resultCount: 0 });
    expect(snapshot.semanticState).toBe('skipped');
  });

  it('persists pending runs and resumes them with the stored continuation on the idempotent retry', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-resume-${randomUUID().slice(0, 8)}`);
    const record = await createAttempt(corpus, 'progressive query');

    let semanticCall = 0;
    const semantic = fakeEngine('semantic', (query) => {
      semanticCall += 1;
      if (semanticCall === 1) {
        expect(query.attempt?.continuationRef).toBeNull();
        return { state: 'pending', continuationRef: 'action-77' };
      }
      expect(query.attempt?.continuationRef).toBe('action-77');
      return readyWith([{ pageId: corpus.pages.semantic.pageId, rank: 0, compatRelevance: 0.9, excerpt: 'late semantic' }]);
    });
    const registry = createSearchEngineRegistry([
      fakeEngine('full_text', () => readyWith([{ pageId: corpus.pages.english.pageId, rank: 0, compatRelevance: 0.6 }])),
      fakeEngine('fuzzy', () => readyWith([])),
      semantic,
    ]);
    const input = await baseInput('progressive query', { attempt: { searchRecordId: record.id } });

    const first = await runCoordinatedSearch(corpus.readerCtx, input, registry);
    expect(first.semanticState).toBe('pending');
    expect(first.items.map((item) => item.page.id)).toEqual([corpus.pages.english.pageId]);
    expect(first.semanticContinuationRef).toBe('action-77');
    const pendingRun = (await searchAnalytics.getEngineRuns(record.id)).find((run) => run.capabilityId === 'semantic');
    expect(pendingRun).toMatchObject({ state: 'pending', continuationRef: 'action-77' });

    const second = await runCoordinatedSearch(corpus.readerCtx, input, registry);
    expect(second.semanticState).toBe('ready');
    expect(second.items.map((item) => item.page.id)).toContain(corpus.pages.semantic.pageId);
    const readyRun = (await searchAnalytics.getEngineRuns(record.id)).find((run) => run.capabilityId === 'semantic');
    expect(readyRun).toMatchObject({ state: 'ready', resultCount: 1 });
  });

  it('does not restart semantic work after a terminal outcome without a continuation', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-term-${randomUUID().slice(0, 8)}`);
    const record = await createAttempt(corpus, 'terminal query');

    const semantic = fakeEngine('semantic', () => ({ state: 'unavailable' }));
    const registry = createSearchEngineRegistry([
      fakeEngine('full_text', () => readyWith([])),
      fakeEngine('fuzzy', () => readyWith([])),
      semantic,
    ]);
    const input = await baseInput('terminal query', { attempt: { searchRecordId: record.id } });

    const first = await runCoordinatedSearch(corpus.readerCtx, input, registry);
    expect(first.semanticState).toBe('unavailable');
    expect(semantic.calls).toHaveLength(1);

    const second = await runCoordinatedSearch(corpus.readerCtx, input, registry);
    expect(second.semanticState).toBe('unavailable');
    // The retry reused the persisted terminal state instead of re-submitting.
    expect(semantic.calls).toHaveLength(1);
  });

  it('threads spaceIds and spaceSlugs through to every engine (023 Raw semantic search)', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-space-${randomUUID().slice(0, 8)}`);
    const semantic = fakeEngine('semantic', () => readyWith([]));
    const registry = createSearchEngineRegistry([semantic]);

    await runCoordinatedSearch(
      corpus.readerCtx,
      await baseInput('anything', {
        snapshot: { full_text: false, fuzzy: false, semantic: true },
        spaceIds: ['space-uuid-123'],
        spaceSlugs: ['raw'],
      }),
      registry,
    );

    expect(semantic.calls[0]).toMatchObject({ spaceIds: ['space-uuid-123'], spaceSlugs: ['raw'] });
  });

  it('threads every space id/slug in one call when the scope covers multiple spaces, never one call per space (023)', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-multispace-${randomUUID().slice(0, 8)}`);
    const fullText = fakeEngine('full_text', () => readyWith([]));
    const registry = createSearchEngineRegistry([fullText]);

    await runCoordinatedSearch(
      corpus.readerCtx,
      await baseInput('anything', {
        snapshot: { full_text: true, fuzzy: false, semantic: false },
        spaceIds: ['space-a', 'space-b', 'space-c'],
        spaceSlugs: ['default', 'raw', 'generated'],
      }),
      registry,
    );

    // Exactly one full_text call carrying every space, not one call per space.
    expect(fullText.calls).toHaveLength(1);
    expect(fullText.calls[0]).toMatchObject({ spaceIds: ['space-a', 'space-b', 'space-c'], spaceSlugs: ['default', 'raw', 'generated'] });
  });

  it('applies the deadline budget input to engines', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`coord-deadline-${randomUUID().slice(0, 8)}`);
    const fullText = fakeEngine('full_text', () => readyWith([]));
    const registry = createSearchEngineRegistry([fullText]);

    await runCoordinatedSearch(
      corpus.readerCtx,
      await baseInput('anything', { snapshot: { full_text: true, fuzzy: false, semantic: false } }),
      registry,
    );

    expect(fullText.calls[0]?.deadlineMs).toBeGreaterThan(0);
    expect(fullText.calls[0]?.deadlineMs).toBeLessThanOrEqual(500);
  });
});

afterAll(async () => {
  await closeDb();
});
