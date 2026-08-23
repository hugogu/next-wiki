import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import { rerenderPage } from '@/server/services/page-rerender';

// The propagation side of the service is observed rather than executed: in a
// test environment the real cache helper is a no-op, and the other two enqueue
// background work this suite is not exercising.
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

const PUBLISHED_SOURCE = '# Published\n\nBody of the published revision.';
const DRAFT_SOURCE = '# Draft\n\nBody of the draft revision.';
const SUPERSEDED_SOURCE = '# Superseded\n\nBody of an older revision.';
/** What a page rendered by a buggy pipeline looks like once it is fixed. */
const STALE_HTML = '<p>rendered by an older pipeline</p>';

let spaceId: string;
let editorId: string;
let readerId: string;
let pageId: string;
let publishedRevisionId: string;
let draftRevisionId: string;
let supersededRevisionId: string;

const editorCtx = (): PermCtx => buildUserCtx(editorId, 'editor');
const readerCtx = (): PermCtx => buildUserCtx(readerId, 'reader');

async function insertRevision(
  versionNumber: number,
  source: string,
  status: 'draft' | 'published',
): Promise<string> {
  const { hash } = renderMarkdown(source);
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId,
      versionNumber,
      contentType: 'text/markdown',
      contentSource: source,
      contentHtml: STALE_HTML,
      contentHash: hash,
      authorId: editorId,
      status,
      publishedAt: status === 'published' ? new Date() : null,
    })
    .returning();
  return revision!.id;
}

async function readRevision(id: string) {
  const revision = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, id),
  });
  if (!revision) throw new Error('Revision not found');
  return revision;
}

beforeAll(async () => {
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  const [space] = await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' }).returning();
  spaceId = space!.id;
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'rerender-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  editorId = editor!.id;
  const [reader] = await db
    .insert(schema.users)
    .values({ email: 'rerender-reader@example.com', passwordHash: 'HASH', role: 'reader' })
    .returning();
  readerId = reader!.id;
});

afterAll(async () => {
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  await closeDb();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  const path = `docs/${randomUUID()}`;
  const [page] = await db
    .insert(schema.pages)
    .values({ spaceId, slug: path, path, title: 'Rendering', authorId: editorId })
    .returning();
  pageId = page!.id;
  supersededRevisionId = await insertRevision(1, SUPERSEDED_SOURCE, 'published');
  publishedRevisionId = await insertRevision(2, PUBLISHED_SOURCE, 'published');
  draftRevisionId = await insertRevision(3, DRAFT_SOURCE, 'draft');
  await db
    .update(schema.pages)
    .set({ currentPublishedVersionId: publishedRevisionId, latestVersionId: draftRevisionId })
    .where(eq(schema.pages.id, pageId));
});

describe('rerenderPage', () => {
  it('renders the published revision and the latest draft again from their stored source', async () => {
    const result = await rerenderPage(editorCtx(), pageId);

    expect(result).toEqual({ pageId, revisionsRendered: 2, revisionsChanged: 2 });
    const published = await readRevision(publishedRevisionId);
    const draft = await readRevision(draftRevisionId);
    expect(published.contentHtml).toBe(renderMarkdown(PUBLISHED_SOURCE).html);
    expect(draft.contentHtml).toBe(renderMarkdown(DRAFT_SOURCE).html);
  });

  it('leaves the source, hash, status, and superseded revisions untouched', async () => {
    const before = await readRevision(publishedRevisionId);
    await rerenderPage(editorCtx(), pageId);

    const published = await readRevision(publishedRevisionId);
    expect(published.contentSource).toBe(before.contentSource);
    expect(published.contentHash).toBe(before.contentHash);
    expect(published.status).toBe('published');
    expect(published.versionNumber).toBe(before.versionNumber);
    const superseded = await readRevision(supersededRevisionId);
    expect(superseded.contentHtml).toBe(STALE_HTML);
    const revisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, pageId),
    });
    expect(revisions).toHaveLength(3);
  });

  it('reports no change when the stored HTML already matches the current pipeline', async () => {
    await rerenderPage(editorCtx(), pageId);
    const result = await rerenderPage(editorCtx(), pageId);

    expect(result).toEqual({ pageId, revisionsRendered: 2, revisionsChanged: 0 });
  });

  it('invalidates the public cache and republishes when the published HTML changed', async () => {
    await rerenderPage(editorCtx(), pageId);

    expect(invalidatePublicContentCache).toHaveBeenCalledTimes(1);
    expect(enqueuePublicPageWarmup).toHaveBeenCalledTimes(1);
    // 'rendering', not 'publish': the Markdown is untouched, so the listener
    // that mirrors source (Git export) must be able to sit this one out.
    expect(notifyPublicContentChanged).toHaveBeenCalledWith('rendering');
  });

  it('propagates nothing when only the draft changed — draft HTML is not publicly readable', async () => {
    await rerenderPage(editorCtx(), pageId);
    // Leave the published revision current and stale the draft on its own.
    await db
      .update(schema.pageRevisions)
      .set({ contentHtml: STALE_HTML })
      .where(eq(schema.pageRevisions.id, draftRevisionId));
    vi.clearAllMocks();

    const result = await rerenderPage(editorCtx(), pageId);

    expect(result).toEqual({ pageId, revisionsRendered: 2, revisionsChanged: 1 });
    expect(invalidatePublicContentCache).not.toHaveBeenCalled();
    expect(enqueuePublicPageWarmup).not.toHaveBeenCalled();
    expect(notifyPublicContentChanged).not.toHaveBeenCalled();
  });

  it('never renders a revision belonging to another page, even through a crossed pointer', async () => {
    // The live-revision pointers are app-enforced, not foreign keys, so a
    // corrupted row must not let this page rewrite another page's HTML.
    const otherPath = `docs/${randomUUID()}`;
    const [otherPage] = await db
      .insert(schema.pages)
      .values({ spaceId, slug: otherPath, path: otherPath, title: 'Other', authorId: editorId })
      .returning();
    const [otherRevision] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId: otherPage!.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource: '# Other\n\nAnother page.',
        contentHtml: STALE_HTML,
        contentHash: renderMarkdown('# Other\n\nAnother page.').hash,
        authorId: editorId,
        status: 'published',
      })
      .returning();
    await db
      .update(schema.pages)
      .set({ latestVersionId: otherRevision!.id })
      .where(eq(schema.pages.id, pageId));

    const result = await rerenderPage(editorCtx(), pageId);

    expect(result).toEqual({ pageId, revisionsRendered: 1, revisionsChanged: 1 });
    expect((await readRevision(otherRevision!.id)).contentHtml).toBe(STALE_HTML);
    expect((await readRevision(publishedRevisionId)).contentHtml).toBe(renderMarkdown(PUBLISHED_SOURCE).html);
  });

  it('refuses a caller without edit permission', async () => {
    await expect(rerenderPage(readerCtx(), pageId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const published = await readRevision(publishedRevisionId);
    expect(published.contentHtml).toBe(STALE_HTML);
  });

  it('fails rather than reporting an empty success when every live pointer is stale', async () => {
    const missing = randomUUID();
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: null, latestVersionId: missing })
      .where(eq(schema.pages.id, pageId));

    await expect(rerenderPage(editorCtx(), pageId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an unknown page', async () => {
    await expect(rerenderPage(editorCtx(), randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
