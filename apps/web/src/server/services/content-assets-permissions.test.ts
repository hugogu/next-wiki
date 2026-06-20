import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  buildAnonymousCtx,
  buildUserCtx,
  type PermCtx,
} from '@/server/permissions';
import * as contentAssets from '@/server/services/content-assets';
import * as pageService from '@/server/services/pages';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let spaceId: string;
let editorId: string;
let otherEditorId: string;
let readerId: string;
let adminId: string;

const editorCtx = (): PermCtx => buildUserCtx(editorId, 'editor');
const otherEditorCtx = (): PermCtx => buildUserCtx(otherEditorId, 'editor');
const readerCtx = (): PermCtx => buildUserCtx(readerId, 'reader');
const adminCtx = (): PermCtx => buildUserCtx(adminId, 'admin');

async function makeUser(email: string, role: 'admin' | 'editor' | 'reader') {
  const [u] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role })
    .returning();
  return u!.id;
}

async function cleanupContent() {
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
}

beforeAll(async () => {
  await cleanupContent();
  await db.delete(schema.users);
  await db.delete(schema.storageBackends);
  await db.delete(schema.spaces);
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'default', name: 'Default', anonymousRead: true })
    .returning();
  spaceId = space!.id;
  editorId = await makeUser('ed@example.com', 'editor');
  otherEditorId = await makeUser('ed2@example.com', 'editor');
  readerId = await makeUser('rd@example.com', 'reader');
  adminId = await makeUser('ad@example.com', 'admin');
});

afterAll(async () => {
  await cleanupContent();
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  await closeDb();
});

beforeEach(cleanupContent);

async function uploadAsEditor(): Promise<string> {
  const { id } = await contentAssets.uploadImage(editorCtx(), PNG);
  return id;
}

describe('upload permissions', () => {
  it('lets an editor upload and rejects readers and anonymous callers', async () => {
    const { id, url } = await contentAssets.uploadImage(editorCtx(), PNG);
    expect(url).toBe(`/api/assets/${id}`);

    await expect(contentAssets.uploadImage(readerCtx(), PNG)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(contentAssets.uploadImage(buildAnonymousCtx(), PNG)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects an oversize/invalid payload with INVALID_IMAGE', async () => {
    await expect(
      contentAssets.uploadImage(editorCtx(), Buffer.from('not an image')),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
});

describe('serving an unreferenced upload', () => {
  it('is readable by the uploader but not by others', async () => {
    const id = await uploadAsEditor();
    expect((await contentAssets.getServableImage(editorCtx(), id)).kind).toBe('ok');
    expect((await contentAssets.getServableImage(otherEditorCtx(), id)).kind).toBe('not_found');
    expect((await contentAssets.getServableImage(buildAnonymousCtx(), id)).kind).toBe('not_found');
  });

  it('stops being readable once the upload TTL has elapsed', async () => {
    const id = await uploadAsEditor();
    await db
      .update(schema.contentAssets)
      .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
      .where(eq(schema.contentAssets.id, id));
    expect((await contentAssets.getServableImage(editorCtx(), id)).kind).toBe('not_found');
  });
});

async function referenceFromRevision(assetId: string, opts: { published: boolean }) {
  const [page] = await db
    .insert(schema.pages)
    .values({ spaceId, slug: 's', path: `img/${randomUUID()}`, title: 'T', authorId: editorId })
    .returning();
  const [rev] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: `![x](/api/assets/${assetId})`,
      contentHtml: '<p></p>',
      contentHash: 'h',
      authorId: editorId,
      status: opts.published ? 'published' : 'draft',
    })
    .returning();
  await db.insert(schema.contentAssetRefs).values({ assetId, revisionId: rev!.id });
  await db
    .update(schema.pages)
    .set({
      latestVersionId: rev!.id,
      currentPublishedVersionId: opts.published ? rev!.id : null,
    })
    .where(eq(schema.pages.id, page!.id));
  return page!.id;
}

describe('serving a referenced asset', () => {
  it('is visible to everyone when referenced by a published page (anonymousRead)', async () => {
    const id = await uploadAsEditor();
    await referenceFromRevision(id, { published: true });
    expect((await contentAssets.getServableImage(buildAnonymousCtx(), id)).kind).toBe('ok');
    expect((await contentAssets.getServableImage(readerCtx(), id)).kind).toBe('ok');
  });

  it('is hidden behind read_draft when only a draft references it', async () => {
    const id = await uploadAsEditor();
    await referenceFromRevision(id, { published: false });
    expect((await contentAssets.getServableImage(buildAnonymousCtx(), id)).kind).toBe('not_found');
    expect((await contentAssets.getServableImage(readerCtx(), id)).kind).toBe('not_found');
    // Author and admin can see the draft's image.
    expect((await contentAssets.getServableImage(editorCtx(), id)).kind).toBe('ok');
    expect((await contentAssets.getServableImage(adminCtx(), id)).kind).toBe('ok');
  });

  it('remains readable via a second page when one referencing page is deleted', async () => {
    const id = await uploadAsEditor();
    const firstPage = await referenceFromRevision(id, { published: true });
    await referenceFromRevision(id, { published: true });
    await db
      .update(schema.pages)
      .set({ deletedAt: new Date() })
      .where(eq(schema.pages.id, firstPage));
    expect((await contentAssets.getServableImage(buildAnonymousCtx(), id)).kind).toBe('ok');
  });
});

describe('reference synchronization on save', () => {
  it('records content_asset_refs for assets referenced by created page markdown', async () => {
    const id = await uploadAsEditor();
    const { versionId } = await pageService.create(editorCtx(), {
      path: `synced/${randomUUID()}`,
      title: 'Synced',
      contentSource: `Here is an image ![x](/api/assets/${id}) inline.`,
    });
    const refs = await db
      .select()
      .from(schema.contentAssetRefs)
      .where(eq(schema.contentAssetRefs.revisionId, versionId));
    expect(refs.length).toBe(1);
    expect(refs[0]!.assetId).toBe(id);
  });
});
