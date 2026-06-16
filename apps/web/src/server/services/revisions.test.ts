import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';

async function ensureDefaultSpace() {
  let space = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, 'default'),
  });
  if (!space) {
    const [created] = await db
      .insert(schema.spaces)
      .values({ slug: 'default', name: 'Default', anonymousRead: true })
      .returning();
    space = created;
  }
  return space;
}

async function createUser(email: string, role: 'admin' | 'editor' | 'reader') {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role, status: 'active' })
    .returning();
  if (!user) throw new Error('Failed to create user');
  return user;
}

async function cleanup() {
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

describe('revisionService US4', () => {
  beforeAll(async () => {
    await cleanup();
    await ensureDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  describe('publish', () => {
    it('atomically swaps the live version', async () => {
      const editor = await createUser('editor-publish@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, {
        slug: 'publish-atomic',
        title: 'Publish Atomic',
        contentSource: 'v1',
      });

      const result = await revisionService.publish(ctx, { slug: 'publish-atomic', version: 1 });

      const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
      expect(page?.currentPublishedVersionId).toBe(result.versionId);

      const revision = await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, result.versionId),
      });
      expect(revision?.status).toBe('published');
      expect(revision?.publishedAt).toBeTruthy();
    });

    it('reader sees published content, not a newer draft', async () => {
      const editor = await createUser('editor-draft@example.com', 'editor');
      const reader = await createUser('reader-draft@example.com', 'reader');
      const editorCtx = buildUserCtx(editor.id, 'editor');
      const readerCtx = buildUserCtx(reader.id, 'reader');

      await pageService.create(editorCtx, { slug: 'publish-live', title: 'Live', contentSource: 'published body' });
      await revisionService.publish(editorCtx, { slug: 'publish-live', version: 1 });

      const live1 = await pageService.getLive(readerCtx, 'publish-live');
      expect(live1?.contentHtml).toContain('published body');

      await pageService.newDraft(editorCtx, { slug: 'publish-live', title: 'Live', contentSource: 'draft body' });

      const live2 = await pageService.getLive(readerCtx, 'publish-live');
      expect(live2?.contentHtml).toContain('published body');
      expect(live2?.contentHtml).not.toContain('draft body');
    });

    it('draft revision is visible only to author and admin', async () => {
      const editor = await createUser('editor-owner@example.com', 'editor');
      const other = await createUser('other-editor@example.com', 'editor');
      const admin = await createUser('admin-reader@example.com', 'admin');
      const reader = await createUser('reader-denied-draft@example.com', 'reader');

      const authorCtx = buildUserCtx(editor.id, 'editor');
      await pageService.create(authorCtx, { slug: 'draft-private', title: 'Draft', contentSource: 'secret' });

      // Author and admin can read the draft revision.
      expect((await pageService.getRevision(authorCtx, 'draft-private', 1))?.contentSource).toBe('secret');
      expect((await pageService.getRevision(buildUserCtx(admin.id, 'admin'), 'draft-private', 1))?.contentSource).toBe('secret');

      // Other editor and reader cannot.
      expect(await pageService.getRevision(buildUserCtx(other.id, 'editor'), 'draft-private', 1)).toBeNull();
      expect(await pageService.getRevision(buildUserCtx(reader.id, 'reader'), 'draft-private', 1)).toBeNull();
      expect(await pageService.getRevision(buildAnonymousCtx(), 'draft-private', 1)).toBeNull();
    });

    it('denies a non-author editor from publishing someone else draft', async () => {
      const owner = await createUser('editor-owner2@example.com', 'editor');
      const other = await createUser('editor-other2@example.com', 'editor');
      const authorCtx = buildUserCtx(owner.id, 'editor');
      const otherCtx = buildUserCtx(other.id, 'editor');

      await pageService.create(authorCtx, { slug: 'draft-owned', title: 'Owned', contentSource: 'x' });

      await expect(
        revisionService.publish(otherCtx, { slug: 'draft-owned', version: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies anonymous and readers', async () => {
      const editor = await createUser('editor-deny@example.com', 'editor');
      const reader = await createUser('reader-deny@example.com', 'reader');
      const editorCtx = buildUserCtx(editor.id, 'editor');

      await pageService.create(editorCtx, { slug: 'deny-publish', title: 'Deny', contentSource: 'x' });

      await expect(
        revisionService.publish(buildAnonymousCtx(), { slug: 'deny-publish', version: 1 }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(
        revisionService.publish(buildUserCtx(reader.id, 'reader'), { slug: 'deny-publish', version: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
