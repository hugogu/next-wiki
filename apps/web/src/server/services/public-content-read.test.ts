import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as publicContent from '@/server/services/public-content';
import {
  createPublicApiUser,
  ensurePublicApiDefaultSpace,
} from '../../../test/public-wiki-api-fixtures';

async function cleanup() {
  await db.delete(schema.apiAuditEntries);
  await db.delete(schema.apiKeys);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

describe('public content read facade', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('returns published page metadata and Markdown source to a reader API key', async () => {
    const editor = await createPublicApiUser('public-read-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-read-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');

    await pageService.create(editorCtx, {
      path: 'public/readable',
      title: 'Readable',
      contentSource: '# Readable',
    });
    await revisions.publish(editorCtx, { path: 'public/readable', version: 1 });

    const page = await publicContent.getPageByPath(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      'public/readable',
    );

    expect(page?.title).toBe('Readable');
    expect(page?.contentSource).toBe('# Readable');
    expect(page?.publishedRevision).toBeUndefined();
    expect(page?.links.byPath).toBe('/api/v1/pages?path=public/readable');

    const withRevision = await publicContent.getPageByPath(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      'public/readable',
      ['publishedRevision'],
    );
    expect(withRevision?.publishedRevision?.version).toBe(1);
  });

  it('hides draft-only pages from reader API keys', async () => {
    const editor = await createPublicApiUser('public-draft-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-draft-reader@example.com', 'reader');

    await pageService.create(buildUserCtx(editor.id, 'editor'), {
      path: 'public/draft-only',
      title: 'Draft Only',
      contentSource: 'draft source',
    });

    const page = await publicContent.getPageByPath(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      'public/draft-only',
    );

    expect(page).toBeNull();
  });

  it('lists published pages with bounded pagination', async () => {
    const editor = await createPublicApiUser('public-list-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-list-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');

    for (const path of ['public/a', 'public/b']) {
      await pageService.create(editorCtx, { path, title: path, contentSource: path });
      await revisions.publish(editorCtx, { path, version: 1 });
    }

    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');
    const first = await publicContent.listPages(readerCtx, { status: 'published', limit: 1, order: 'path', include: [] });

    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items[0]?.contentSource).toBeUndefined();
    expect(first.items[0]?.latestRevision).toBeUndefined();
    expect(first.items[0]?.publishedRevision).toBeUndefined();

    const withRevisions = await publicContent.listPages(readerCtx, {
      status: 'published',
      limit: 1,
      order: 'path',
      include: ['latestRevision', 'publishedRevision'],
    });
    expect(withRevisions.items[0]?.contentSource).toBeUndefined();
    expect(withRevisions.items[0]?.latestRevision?.version).toBe(1);
    expect(withRevisions.items[0]?.publishedRevision?.version).toBe(1);
  });

  it('keeps contentSource for the path= exact-lookup filter (single-page lookup, not browsing)', async () => {
    const editor = await createPublicApiUser('public-path-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-path-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');

    await pageService.create(editorCtx, { path: 'public/by-path', title: 'By Path', contentSource: '# By Path' });
    await revisions.publish(editorCtx, { path: 'public/by-path', version: 1 });

    const result = await publicContent.listPages(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      { status: 'published', path: 'public/by-path', limit: 20, order: 'path', include: [] },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.contentSource).toBe('# By Path');
    expect(result.items[0]?.latestRevision).toBeUndefined();
  });

  it('finds a q match outside the default pagination window', async () => {
    const editor = await createPublicApiUser('public-search-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-search-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    // The match sorts oldest-by-publish-time; create enough newer pages first
    // to push it past a default-sized (limit=20) fetch window.
    await pageService.create(editorCtx, {
      path: 'philosophy/figures/wang-yangming',
      title: '王阳明',
      contentSource: '# 王阳明\n\n王阳明（1472—1529）是明代著名的思想家。',
    });
    await revisions.publish(editorCtx, { path: 'philosophy/figures/wang-yangming', version: 1 });

    for (let i = 0; i < 25; i++) {
      const path = `public/filler-${i}`;
      await pageService.create(editorCtx, { path, title: `Filler ${i}`, contentSource: path });
      await revisions.publish(editorCtx, { path, version: 1 });
    }

    const result = await publicContent.listPages(readerCtx, {
      status: 'published',
      q: '王阳明',
      limit: 20,
      order: 'recent',
      include: [],
    });

    expect(result.items.map((item) => item.path)).toContain('philosophy/figures/wang-yangming');
  });

  it('search results never include contentSource and excerpt is centered on the match', async () => {
    const editor = await createPublicApiUser('public-excerpt-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-excerpt-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    const filler = 'x'.repeat(80);
    await pageService.create(editorCtx, {
      path: 'docs/haystack',
      title: 'Haystack Doc',
      contentSource: `${filler}NEEDLE${filler}`,
    });
    await revisions.publish(editorCtx, { path: 'docs/haystack', version: 1 });

    const result = await publicContent.searchPages(readerCtx, {
      q: 'NEEDLE',
      scope: 'all',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 20,
    });

    const hit = result.items.find((item) => item.page.path === 'docs/haystack');
    expect(hit).toBeDefined();
    expect(hit?.matchType).toBe('content');
    expect(hit?.page.contentSource).toBeUndefined();
    expect(hit?.excerpt).toContain('NEEDLE');
    // Centered window: much shorter than the full 166-char content.
    expect(hit!.excerpt!.length).toBeLessThan(40);
  });

  it('revision list omits contentSource; a single revision fetch includes it', async () => {
    const editor = await createPublicApiUser('public-revlist-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-revlist-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, { path: 'docs/revlist', title: 'Rev List', contentSource: '# v1' });
    await revisions.publish(editorCtx, { path: 'docs/revlist', version: 1 });
    const page = await publicContent.getPageByPath(readerCtx, 'docs/revlist');

    const list = await publicContent.listRevisions(readerCtx, page!.id, { limit: 20 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.contentSource).toBeUndefined();

    const single = await publicContent.getRevision(readerCtx, page!.id, 1);
    expect(single?.contentSource).toBe('# v1');
  });
});
