import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS } from '@next-wiki/shared';
import { closeDb } from '@/server/db';
import { ensurePublicApiDefaultSpace } from '../../../../test/public-wiki-api-fixtures';
import { createFullTextEngine } from './engines/postgres-tsvector';
import { createSearchFixtureCorpus, ENGLISH_TERM } from './test-support';

const engine = createFullTextEngine();

async function query(q: string) {
  const space = await ensurePublicApiDefaultSpace();
  return { q, limit: 20, deadlineMs: DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS, spaceIds: [space!.id], spaceSlugs: [space!.slug] };
}

describe('full_text engine (PostgreSQL tsvector, simple configuration)', () => {
  it('returns the intended page for an exact indexed term with exact evidence', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`fts-term-${randomUUID().slice(0, 8)}`);

    const outcome = await engine.run(corpus.readerCtx, await query(ENGLISH_TERM));

    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    const hit = outcome.candidates.find((candidate) => candidate.pageId === corpus.pages.english.pageId);
    expect(hit).toBeDefined();
    expect(hit?.exact?.term).toBe(true);
    expect(hit?.excerpt).toContain('search architecture');
    expect(hit?.compatRelevance).toBeGreaterThan(0);
  });

  it('matches word-oriented multi-term queries through websearch_to_tsquery', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`fts-multi-${randomUUID().slice(0, 8)}`);

    // Terms present in the document but not adjacent — a substring match
    // would fail while term-oriented retrieval succeeds.
    const outcome = await engine.run(corpus.readerCtx, await query('ranking retrieval'));

    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    expect(outcome.candidates.some((candidate) => candidate.pageId === corpus.pages.english.pageId)).toBe(true);
  });

  it('returns bounded internal candidates only — draft pages are simply rows it never selects', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`fts-scope-${randomUUID().slice(0, 8)}`);

    // The hidden draft contains the exact term but has no published revision.
    const outcome = await engine.run(corpus.readerCtx, await query(ENGLISH_TERM));
    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    expect(outcome.candidates.some((candidate) => candidate.pageId === corpus.pages.hiddenDraft.pageId)).toBe(false);
    expect(outcome.candidates.length).toBeLessThanOrEqual(50);
    // Candidates carry no public page fields or diagnostics.
    for (const candidate of outcome.candidates) {
      expect(Object.keys(candidate).sort()).toEqual(['compatRelevance', 'exact', 'excerpt', 'field', 'pageId', 'rank']);
    }
  });

  it('returns no candidate for a term absent from the corpus', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`fts-none-${randomUUID().slice(0, 8)}`);
    const outcome = await engine.run(corpus.readerCtx, await query('zzzabsenttoken'));
    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    expect(outcome.candidates).toHaveLength(0);
  });
});

afterAll(async () => {
  await closeDb();
});
