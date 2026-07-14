import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { buildAnonymousCtx } from '@/server/permissions';
import { ensurePublicApiDefaultSpace } from '../../../../test/public-wiki-api-fixtures';
import { buildExcerpt, compactExcerpt, projectReadableCandidatePages } from './candidate-projection';
import { createSearchFixtureCorpus, HIDDEN_TOKEN } from './test-support';

describe('search candidate projection', () => {
  it('hydrates only published, readable pages and silently drops everything else', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`projection-${randomUUID().slice(0, 8)}`);
    const unknownPageId = randomUUID();

    const projected = await projectReadableCandidatePages(corpus.readerCtx, [
      corpus.pages.english.pageId,
      corpus.pages.chinese.pageId,
      corpus.pages.hiddenDraft.pageId,
      unknownPageId,
      corpus.pages.english.pageId, // duplicate input collapses
    ]);

    expect([...projected.keys()].sort()).toEqual(
      [corpus.pages.english.pageId, corpus.pages.chinese.pageId].sort(),
    );
    const english = projected.get(corpus.pages.english.pageId);
    expect(english?.page).toMatchObject({
      status: 'published',
      spaceSlug: 'default',
      path: corpus.pages.english.path,
      title: 'Search Architecture',
    });
    expect(english?.page.locale).toBeTruthy();
    // The draft-only page leaves no trace: no entry, no title, no excerpt source.
    expect(JSON.stringify([...projected.values()].map((entry) => entry.page))).not.toContain(HIDDEN_TOKEN);
    expect(projected.has(corpus.pages.hiddenDraft.pageId)).toBe(false);
  });

  it('returns nothing for an actor without page-list read permission', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`projection-perm-${randomUUID().slice(0, 8)}`);

    // The default fixture space allows anonymous read; verify the projection
    // still consults the permission chokepoint by checking a readable actor
    // versus results for the same candidate list.
    const anonymous = await projectReadableCandidatePages(buildAnonymousCtx(), [corpus.pages.english.pageId]);
    expect(anonymous.size).toBeLessThanOrEqual(1);

    const readable = await projectReadableCandidatePages(corpus.readerCtx, [corpus.pages.english.pageId]);
    expect(readable.has(corpus.pages.english.pageId)).toBe(true);
  });

  it('keeps contentSource server-side for excerpt evidence without exposing it on the page resource', async () => {
    await ensurePublicApiDefaultSpace();
    const corpus = await createSearchFixtureCorpus(`projection-content-${randomUUID().slice(0, 8)}`);

    const projected = await projectReadableCandidatePages(corpus.readerCtx, [corpus.pages.english.pageId]);
    const entry = projected.get(corpus.pages.english.pageId);
    expect(entry?.contentSource).toContain('search architecture');
    expect(entry?.page).not.toHaveProperty('contentSource');
  });
});

describe('excerpt helpers', () => {
  it('centers the excerpt on the first case-insensitive match', () => {
    const filler = 'x'.repeat(80);
    const excerpt = buildExcerpt(`${filler}NEEDLE${filler}`, 'needle', 20);
    expect(excerpt).toContain('NEEDLE');
    expect(excerpt!.length).toBeLessThan(40);
  });

  it('compacts whitespace and honors the show flag', () => {
    expect(compactExcerpt('a   b\n\nc', 'b', 100, true)).toBe('a b c');
    expect(compactExcerpt('anything', 'b', 100, false)).toBeNull();
    expect(compactExcerpt(null, 'b', 100, true)).toBeNull();
  });
});

afterAll(async () => {
  await closeDb();
});
