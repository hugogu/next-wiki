import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { rerenderPage } from '@/server/services/page-rerender';

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

  it('refuses a caller without edit permission', async () => {
    await expect(rerenderPage(readerCtx(), pageId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const published = await readRevision(publishedRevisionId);
    expect(published.contentHtml).toBe(STALE_HTML);
  });

  it('rejects an unknown page', async () => {
    await expect(rerenderPage(editorCtx(), randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
