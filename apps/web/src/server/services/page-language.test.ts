import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { renderMarkdown } from '@/server/pipeline';
import { createPublicApiUser, ensurePublicApiDefaultSpace } from '../../../test/public-wiki-api-fixtures';

// The propagation side is observed rather than executed: in a test environment
// the real cache helper is a no-op, and the other two enqueue background work
// this suite is not exercising.
vi.mock('@/server/cache/public-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/cache/public-cache')>()),
  invalidatePublicContentCache: vi.fn(),
}));
vi.mock('@/server/services/public-content-events', () => ({
  notifyPublicContentChanged: vi.fn(async () => undefined),
}));
vi.mock('@/server/services/public-page-warmup', () => ({
  enqueuePublicPageWarmup: vi.fn(async () => undefined),
}));

let spaceId: string;
let editorId: string;
let readerId: string;

const editorCtx = (): PermCtx => buildUserCtx(editorId, 'editor');
const readerCtx = (): PermCtx => buildUserCtx(readerId, 'reader');

async function cleanup() {
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

/** An original page, optionally already written in a language. */
async function createPage(path: string, locale: string | null = null) {
  const created = await pageService.create(editorCtx(), { path, title: path, contentSource: `# ${path}` });
  if (locale) await db.update(schema.pages).set({ locale }).where(eq(schema.pages.id, created.pageId));
  return created;
}

async function readPage(id: string) {
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, id) });
  if (!page) throw new Error('Page not found');
  return page;
}

/** A row the way the translation writer lays it out: same address as its source. */
async function insertTranslation(
  source: { id: string; path: string; slug: string; title: string },
  locale: string,
  overrides: Partial<typeof schema.pages.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.pages)
    .values({
      spaceId,
      slug: source.slug,
      path: source.path,
      title: source.title,
      authorId: editorId,
      nature: 'generated',
      locale,
      translationGroupId: randomUUID(),
      sourcePageId: source.id,
      ...overrides,
    })
    .returning();
  return row!;
}

/** A second original at the same path, which the identity key allows when its language differs. */
async function insertSiblingOriginal(path: string, locale: string | null) {
  const [row] = await db
    .insert(schema.pages)
    .values({ spaceId, slug: `${path}-${randomUUID().slice(0, 8)}`, path, title: path, authorId: editorId, locale })
    .returning();
  const source = `# ${path}`;
  const { html, hash } = renderMarkdown(source);
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: row!.id,
      versionNumber: 1,
      contentType: 'text/markdown',
      contentSource: source,
      contentHtml: html,
      contentHash: hash,
      authorId: editorId,
      status: 'draft',
    })
    .returning();
  await db.update(schema.pages).set({ latestVersionId: revision!.id }).where(eq(schema.pages.id, row!.id));
  return row!;
}

beforeAll(async () => {
  await cleanup();
  const space = await ensurePublicApiDefaultSpace();
  spaceId = space!.id;
  editorId = (await createPublicApiUser('page-language-editor@example.com', 'editor')).id;
  readerId = (await createPublicApiUser('page-language-reader@example.com', 'reader')).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
});

describe('setting the language of a page', () => {
  it('sets, changes and clears the language of an original', async () => {
    const { pageId } = await createPage('lang/basic');
    expect((await readPage(pageId)).locale).toBeNull();

    await pageService.updateProperties(editorCtx(), 'lang/basic', { locale: 'zh' });
    expect((await readPage(pageId)).locale).toBe('zh');

    await pageService.updateProperties(editorCtx(), 'lang/basic', { locale: 'fr' });
    expect((await readPage(pageId)).locale).toBe('fr');

    await pageService.updateProperties(editorCtx(), 'lang/basic', { locale: null });
    expect((await readPage(pageId)).locale).toBeNull();
  });

  it('stores a code in its normalized form', async () => {
    const { pageId } = await createPage('lang/normalized');
    await pageService.updateProperties(editorCtx(), 'lang/normalized', { locale: ' ZH ' });
    expect((await readPage(pageId)).locale).toBe('zh');
  });

  it.each(['english', 'zh-CN', 'e', '', '12'])('rejects %j, which is not a language code', async (value) => {
    const { pageId } = await createPage('lang/invalid');
    await expect(pageService.updateProperties(editorCtx(), 'lang/invalid', { locale: value })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect((await readPage(pageId)).locale).toBeNull();
  });

  it('needs something to change, and null counts as something', async () => {
    const { pageId } = await createPage('lang/empty', 'de');
    await expect(pageService.updateProperties(editorCtx(), 'lang/empty', {})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(pageService.updateProperties(editorCtx(), 'lang/empty', { locale: undefined })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await pageService.updateProperties(editorCtx(), 'lang/empty', { locale: null });
    expect((await readPage(pageId)).locale).toBeNull();
  });

  it('leaves the language alone when it is not mentioned', async () => {
    const { pageId } = await createPage('lang/untouched', 'ja');
    await pageService.updateProperties(editorCtx(), 'lang/untouched', { title: 'Renamed' });
    const page = await readPage(pageId);
    expect(page.title).toBe('Renamed');
    expect(page.locale).toBe('ja');
  });

  it('is a property change: no revision is written and the page does not move', async () => {
    const created = await createPage('lang/no-revision');
    const before = await readPage(created.pageId);
    const revisionsBefore = await db
      .select({ value: count() })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId));

    await pageService.updateProperties(editorCtx(), 'lang/no-revision', { locale: 'zh' });

    const after = await readPage(created.pageId);
    const revisionsAfter = await db
      .select({ value: count() })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId));
    expect(revisionsAfter[0]?.value).toBe(revisionsBefore[0]?.value);
    expect(after.latestVersionId).toBe(before.latestVersionId);
    expect(after.path).toBe(before.path);
    expect(after.slug).toBe(before.slug);
  });

  it('can be combined with a rename in one call', async () => {
    const { pageId } = await createPage('lang/combined');
    await pageService.updateProperties(editorCtx(), 'lang/combined', { path: 'lang/combined-moved', locale: 'ko' });
    const page = await readPage(pageId);
    expect(page.path).toBe('lang/combined-moved');
    expect(page.locale).toBe('ko');
  });

  it('needs permission to edit the page', async () => {
    const { pageId } = await createPage('lang/forbidden');
    await expect(
      pageService.updateProperties(readerCtx(), 'lang/forbidden', { locale: 'zh' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await readPage(pageId)).locale).toBeNull();
  });

  it('refuses a base revision that is no longer the latest', async () => {
    const { pageId } = await createPage('lang/stale');
    await expect(
      pageService.updateProperties(editorCtx(), 'lang/stale', { locale: 'zh', baseRevisionId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect((await readPage(pageId)).locale).toBeNull();
  });

  it('tells the public cache and the content listeners that the page changed', async () => {
    await createPage('lang/notify');
    vi.clearAllMocks();
    await pageService.updateProperties(editorCtx(), 'lang/notify', { locale: 'zh' });
    expect(invalidatePublicContentCache).toHaveBeenCalled();
    expect(notifyPublicContentChanged).toHaveBeenCalledWith('publish');
  });

  it('does not announce a change when the page already has that language', async () => {
    await createPage('lang/unchanged', 'zh');
    vi.clearAllMocks();
    await pageService.updateProperties(editorCtx(), 'lang/unchanged', { locale: 'zh' });
    expect(notifyPublicContentChanged).not.toHaveBeenCalled();
  });
});

describe('a language another page already holds', () => {
  it('refuses a language the page already has a translation in', async () => {
    const created = await createPage('conflict/translated');
    const source = await readPage(created.pageId);
    await insertTranslation(source, 'en');

    await expect(pageService.updateProperties(editorCtx(), 'conflict/translated', { locale: 'en' })).rejects.toMatchObject({
      code: 'PAGE_LANGUAGE_CONFLICT',
      message: 'This page already has a translation in that language',
    });
    expect((await readPage(created.pageId)).locale).toBeNull();
  });

  it('finds the translation by its link to the page even when its own path has drifted', async () => {
    const created = await createPage('conflict/drifted');
    const source = await readPage(created.pageId);
    await insertTranslation(source, 'en', { path: 'conflict/drifted-elsewhere' });

    await expect(pageService.updateProperties(editorCtx(), 'conflict/drifted', { locale: 'en' })).rejects.toMatchObject({
      code: 'PAGE_LANGUAGE_CONFLICT',
    });
  });

  it('ignores a deleted translation that no longer shares the path', async () => {
    const created = await createPage('conflict/deleted');
    const source = await readPage(created.pageId);
    await insertTranslation(source, 'en', { path: 'conflict/deleted-elsewhere', deletedAt: new Date() });

    await pageService.updateProperties(editorCtx(), 'conflict/deleted', { locale: 'en' });
    expect((await readPage(created.pageId)).locale).toBe('en');
  });

  it('allows a language none of its translations is written in', async () => {
    const created = await createPage('conflict/other-language');
    const source = await readPage(created.pageId);
    await insertTranslation(source, 'en');

    await pageService.updateProperties(editorCtx(), 'conflict/other-language', { locale: 'zh' });
    expect((await readPage(created.pageId)).locale).toBe('zh');
  });

  it('refuses a language another original already holds at the same path', async () => {
    const created = await createPage('conflict/sibling');
    await insertSiblingOriginal('conflict/sibling', 'zh');

    await expect(
      publicContent.updateProperties(editorCtx(), created.pageId, { locale: 'zh' }),
    ).rejects.toMatchObject({
      code: 'PAGE_LANGUAGE_CONFLICT',
      message: 'Another page already uses this path in that language',
    });
    expect((await readPage(created.pageId)).locale).toBeNull();
  });

  it('refuses to clear the language when another original at the path has none', async () => {
    const created = await createPage('conflict/clear', 'ja');
    await insertSiblingOriginal('conflict/clear', null);

    await expect(
      publicContent.updateProperties(editorCtx(), created.pageId, { locale: null }),
    ).rejects.toMatchObject({ code: 'PAGE_LANGUAGE_CONFLICT' });
    expect((await readPage(created.pageId)).locale).toBe('ja');
  });

  it('edits the page it was asked to when two originals share a path', async () => {
    const first = await createPage('conflict/shared', 'ja');
    const second = await insertSiblingOriginal('conflict/shared', null);

    await publicContent.updateProperties(editorCtx(), first.pageId, { locale: 'ko' });
    expect((await readPage(first.pageId)).locale).toBe('ko');
    expect((await readPage(second.id)).locale).toBeNull();

    await publicContent.updateProperties(editorCtx(), second.id, { locale: 'zh' });
    expect((await readPage(second.id)).locale).toBe('zh');
    expect((await readPage(first.pageId)).locale).toBe('ko');
  });
});

describe('setting the language through the public content API', () => {
  it('returns the page with its new language, and null once it is cleared', async () => {
    const created = await createPage('api/roundtrip');

    const set = await publicContent.updateProperties(editorCtx(), created.pageId, { locale: 'zh' });
    expect(set.locale).toBe('zh');
    expect((await publicContent.getPageById(editorCtx(), created.pageId, []))?.locale).toBe('zh');

    const cleared = await publicContent.updateProperties(editorCtx(), created.pageId, { locale: null });
    expect(cleared.locale).toBeNull();
  });

  it('does not change the language of a translation, nor of the original it shares a path with', async () => {
    const created = await createPage('api/translation', 'ja');
    const translation = await insertTranslation(await readPage(created.pageId), 'en');

    await expect(
      publicContent.updateProperties(editorCtx(), translation.id, { locale: 'fr' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect((await readPage(translation.id)).locale).toBe('en');
    expect((await readPage(created.pageId)).locale).toBe('ja');
  });
});
