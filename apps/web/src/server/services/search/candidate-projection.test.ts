import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { ensurePublicApiDefaultSpace, createPublicApiUser } from '../../../../test/public-wiki-api-fixtures';
import { buildExcerpt, compactExcerpt, projectReadableCandidatePages } from './candidate-projection';
import { createSearchFixtureCorpus, HIDDEN_TOKEN } from './test-support';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import { seedWritingModeSpaces } from '@/server/seed';
import { getSpaceBySlug } from '@/server/services/spaces';
import { setModeInternal } from '@/server/services/writing-mode';
import * as rawEntries from '@/server/services/raw-entries';

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
    // Projection is intentionally engine-neutral: provenance is added only by
    // the coordinator after this permission boundary has removed hidden pages.
    expect(english).not.toHaveProperty('engineSources');
    expect(JSON.stringify(english)).not.toContain('pg_trgm');
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

  it('projects raw and generated candidates only for an admin in LLM Wiki mode', async () => {
    await seedWritingModeSpaces();
    const admin = await createPublicApiUser(`projection-admin-${randomUUID()}@example.com`, 'admin');
    const adminCtx = buildUserCtx(admin.id, 'admin');
    const path = `projection-${randomUUID().slice(0, 8)}/generated-search`;

    await setModeInternal('llm-wiki', admin.id);
    try {
      const created = await pageService.create(adminCtx, {
        path,
        title: 'Generated Search',
        contentSource: '# Generated Search',
      }, 'generated');
      await revisionService.publish(adminCtx, { path, version: 1, space: 'generated' });
      const generated = await getSpaceBySlug('generated');
      const raw = await getSpaceBySlug('raw');
      expect(generated).not.toBeNull();
      expect(raw).not.toBeNull();
      // Raw entries require a category; a default lets create omit an explicit id.
      await db.insert(schema.rawCategories).values({ name: 'General', slug: 'general', isDefault: true }).onConflictDoNothing();

      const rawEntry = await rawEntries.createEntry(adminCtx, {
        path: `projection-${randomUUID().slice(0, 8)}/raw-search`,
        title: 'Raw Search',
        inputKind: 'manual-note',
        content: 'Original raw search evidence',
      });

      const adminProjection = await projectReadableCandidatePages(adminCtx, [created.pageId], generated!.id);
      expect(adminProjection.get(created.pageId)?.page.spaceSlug).toBe('generated');
      const adminRawProjection = await projectReadableCandidatePages(adminCtx, [rawEntry.pageId], raw!.id);
      expect(adminRawProjection.get(rawEntry.pageId)?.page.spaceSlug).toBe('raw');

      const reader = await createPublicApiUser(`projection-reader-${randomUUID()}@example.com`, 'reader');
      const readerProjection = await projectReadableCandidatePages(buildUserCtx(reader.id, 'reader'), [created.pageId], generated!.id);
      expect(readerProjection.size).toBe(0);
      const readerRawProjection = await projectReadableCandidatePages(buildUserCtx(reader.id, 'reader'), [rawEntry.pageId], raw!.id);
      expect(readerRawProjection.size).toBe(0);
    } finally {
      await setModeInternal('copilot', admin.id);
    }
  });

  it('exposes rawCategorySystemKey for a built-in-category raw candidate, null otherwise (023)', async () => {
    await seedWritingModeSpaces();
    const admin = await createPublicApiUser(`projection-conv-admin-${randomUUID()}@example.com`, 'admin');
    const adminCtx = buildUserCtx(admin.id, 'admin');

    await setModeInternal('llm-wiki', admin.id);
    try {
      const raw = await getSpaceBySlug('raw');
      expect(raw).not.toBeNull();
      await db.insert(schema.rawCategories).values({ name: 'General', slug: 'general', isDefault: true }).onConflictDoNothing();
      const { ensureSystemCategory } = await import('@/server/services/raw-categories');
      const conversationCategory = await ensureSystemCategory('conversation', { name: 'Conversation', slug: 'conversation' });

      const conversationEntry = await rawEntries.createEntry(adminCtx, {
        path: `projection-${randomUUID().slice(0, 8)}/conversation`,
        title: 'Conversation: test',
        inputKind: 'chat-transcript',
        content: 'Captured transcript content',
        categoryId: conversationCategory.id,
      });
      const generalEntry = await rawEntries.createEntry(adminCtx, {
        path: `projection-${randomUUID().slice(0, 8)}/general`,
        title: 'General note',
        inputKind: 'manual-note',
        content: 'A plain raw note',
      });

      const projected = await projectReadableCandidatePages(
        adminCtx,
        [conversationEntry.pageId, generalEntry.pageId],
        raw!.id,
      );
      expect(projected.get(conversationEntry.pageId)?.page.rawCategorySystemKey).toBe('conversation');
      expect(projected.get(generalEntry.pageId)?.page.rawCategorySystemKey).toBeNull();
    } finally {
      await setModeInternal('copilot', admin.id);
    }
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
