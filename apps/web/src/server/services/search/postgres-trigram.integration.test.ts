import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS } from '@next-wiki/shared';
import { closeDb } from '@/server/db';
import { ensurePublicApiDefaultSpace } from '../../../../test/public-wiki-api-fixtures';
import { createFuzzyEngine } from './engines/postgres-trigram';
import { CHINESE_FRAGMENT, CHINESE_NEAR_MATCH, createSearchFixtureCorpus } from './test-support';

const engine = createFuzzyEngine();

function query(q: string) {
  return { q, limit: 20, deadlineMs: DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS };
}

describe('fuzzy engine (PostgreSQL pg_trgm)', () => {
  it('returns the intended page for a meaningful contiguous Chinese fragment', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`trgm-frag-${randomUUID().slice(0, 8)}`);

    const outcome = await engine.run(corpus.readerCtx, query(CHINESE_FRAGMENT));

    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    const hit = outcome.candidates.find((candidate) => candidate.pageId === corpus.pages.chinese.pageId);
    expect(hit).toBeDefined();
    expect(hit?.exact?.term).toBe(true);
    expect(hit?.excerpt).toContain(CHINESE_FRAGMENT);
  });

  it('returns the intended page for a one-character imperfect Chinese variation', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`trgm-near-${randomUUID().slice(0, 8)}`);

    const outcome = await engine.run(corpus.readerCtx, query(CHINESE_NEAR_MATCH));

    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    const positions = outcome.candidates
      .sort((a, b) => a.rank - b.rank)
      .findIndex((candidate) => candidate.pageId === corpus.pages.chinese.pageId);
    // SC-001: intended readable page within the first five results.
    expect(positions).toBeGreaterThanOrEqual(0);
    expect(positions).toBeLessThan(5);
    const hit = outcome.candidates.find((candidate) => candidate.pageId === corpus.pages.chinese.pageId)!;
    // A near match has no verbatim occurrence — no excerpt evidence is invented.
    expect(hit.exact?.term ?? false).toBe(false);
  });

  it('handles mixed-script queries without failing', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`trgm-mixed-${randomUUID().slice(0, 8)}`);
    const outcome = await engine.run(corpus.readerCtx, query('对账 architecture 2026'));
    expect(outcome.state).toBe('ready');
  });

  it('rejects unrelated low-similarity pages instead of speculating', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`trgm-noise-${randomUUID().slice(0, 8)}`);

    // Unrelated Chinese phrase: word similarity against the corpus is 0.0.
    const outcome = await engine.run(corpus.readerCtx, query('天气预报明天'));

    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    expect(outcome.candidates.some((candidate) => candidate.pageId === corpus.pages.chinese.pageId)).toBe(false);
    expect(outcome.candidates.some((candidate) => candidate.pageId === corpus.pages.english.pageId)).toBe(false);
  });

  it('never selects a draft-only page even when its content matches', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`trgm-draft-${randomUUID().slice(0, 8)}`);
    const outcome = await engine.run(corpus.readerCtx, query(CHINESE_FRAGMENT));
    expect(outcome.state).toBe('ready');
    if (outcome.state !== 'ready') return;
    expect(outcome.candidates.some((candidate) => candidate.pageId === corpus.pages.hiddenDraft.pageId)).toBe(false);
  });
});

afterAll(async () => {
  await closeDb();
});
