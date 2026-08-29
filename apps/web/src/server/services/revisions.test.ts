import { afterEach, beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import * as publicCache from '@/server/cache/public-cache';
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
        path: 'publish-atomic',
        title: 'Publish Atomic',
        contentSource: 'v1',
      });

      const result = await revisionService.publish(ctx, { path: 'publish-atomic', version: 1 });

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

      await pageService.create(editorCtx, { path: 'publish-live', title: 'Live', contentSource: 'published body' });
      await revisionService.publish(editorCtx, { path: 'publish-live', version: 1 });

      const live1 = await pageService.getLive(readerCtx, 'publish-live');
      expect(live1?.contentHtml).toContain('published body');

      await pageService.newDraft(editorCtx, 'publish-live', { title: 'Live', contentSource: 'draft body' });

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
      await pageService.create(authorCtx, { path: 'draft-private', title: 'Draft', contentSource: 'secret' });

      expect((await pageService.getRevision(authorCtx, 'draft-private', 1))?.contentSource).toBe('secret');
      expect((await pageService.getRevision(buildUserCtx(admin.id, 'admin'), 'draft-private', 1))?.contentSource).toBe('secret');

      expect(await pageService.getRevision(buildUserCtx(other.id, 'editor'), 'draft-private', 1)).toBeNull();
      expect(await pageService.getRevision(buildUserCtx(reader.id, 'reader'), 'draft-private', 1)).toBeNull();
      expect(await pageService.getRevision(buildAnonymousCtx(), 'draft-private', 1)).toBeNull();
    });

    it('denies a non-author editor from publishing someone else draft', async () => {
      const owner = await createUser('editor-owner2@example.com', 'editor');
      const other = await createUser('editor-other2@example.com', 'editor');
      const authorCtx = buildUserCtx(owner.id, 'editor');
      const otherCtx = buildUserCtx(other.id, 'editor');

      await pageService.create(authorCtx, { path: 'draft-owned', title: 'Owned', contentSource: 'x' });

      await expect(
        revisionService.publish(otherCtx, { path: 'draft-owned', version: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies anonymous and readers', async () => {
      const editor = await createUser('editor-deny@example.com', 'editor');
      const reader = await createUser('reader-deny@example.com', 'reader');
      const editorCtx = buildUserCtx(editor.id, 'editor');

      await pageService.create(editorCtx, { path: 'deny-publish', title: 'Deny', contentSource: 'x' });

      await expect(
        revisionService.publish(buildAnonymousCtx(), { path: 'deny-publish', version: 1 }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(
        revisionService.publish(buildUserCtx(reader.id, 'reader'), { path: 'deny-publish', version: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('skips the broad public-content cache invalidation when the caller opts out', async () => {
      const editor = await createUser('editor-skip-invalidation@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');
      await pageService.create(ctx, { path: 'publish-skip-invalidation', title: 'Skip', contentSource: 'v1' });

      const invalidateSpy = vi.spyOn(publicCache, 'invalidatePublicContentCache');
      await revisionService.publish(ctx, { path: 'publish-skip-invalidation', version: 1, skipPublicCacheInvalidation: true });
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes a superseded revision and hides it from history and reads', async () => {
      const editor = await createUser('editor-delete-rev@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, { path: 'delete-rev-superseded', title: 'T', contentSource: 'v1' });
      await revisionService.publish(ctx, { path: 'delete-rev-superseded', version: 1 });
      await pageService.newDraft(ctx, 'delete-rev-superseded', { title: 'T', contentSource: 'v2' });
      await revisionService.publish(ctx, { path: 'delete-rev-superseded', version: 2 });

      await revisionService.remove(ctx, { pageId, version: 1 });

      const history = await pageService.getHistory(ctx, 'delete-rev-superseded');
      expect(history.map((r) => r.version)).toEqual([2]);
      expect(await pageService.getRevision(ctx, 'delete-rev-superseded', 1)).toBeNull();
    });

    it('rejects deleting the currently published revision', async () => {
      const editor = await createUser('editor-delete-current@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, { path: 'delete-rev-current', title: 'T', contentSource: 'v1' });
      await revisionService.publish(ctx, { path: 'delete-rev-current', version: 1 });

      await expect(
        revisionService.remove(ctx, { pageId, version: 1 }),
      ).rejects.toMatchObject({ code: 'REVISION_NOT_DELETABLE' });
    });

    it('rejects deleting the only remaining revision', async () => {
      const editor = await createUser('editor-delete-latest@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, { path: 'delete-rev-latest', title: 'T', contentSource: 'v1' });

      await expect(
        revisionService.remove(ctx, { pageId, version: 1 }),
      ).rejects.toMatchObject({ code: 'REVISION_NOT_DELETABLE' });
    });

    it('deletes the latest revision when a sibling survives, moving latestVersionId back', async () => {
      const editor = await createUser('editor-delete-latest-sibling@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, { path: 'delete-rev-latest-sibling', title: 'T', contentSource: 'v1' });
      await revisionService.publish(ctx, { path: 'delete-rev-latest-sibling', version: 1 });
      await pageService.newDraft(ctx, 'delete-rev-latest-sibling', { title: 'T', contentSource: 'v2' });

      const v1 = await db.query.pageRevisions.findFirst({
        where: and(eq(schema.pageRevisions.pageId, pageId), eq(schema.pageRevisions.versionNumber, 1)),
      });
      if (!v1) throw new Error('Failed to find v1');

      await revisionService.remove(ctx, { pageId, version: 2 });

      const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
      expect(page?.latestVersionId).toBe(v1.id);

      const history = await pageService.getHistory(ctx, 'delete-rev-latest-sibling');
      expect(history.map((r) => r.version)).toEqual([1]);
    });

    it('denies a non-author, non-admin editor from deleting the revision', async () => {
      const owner = await createUser('editor-delrev-owner@example.com', 'editor');
      const other = await createUser('editor-delrev-other@example.com', 'editor');
      const ownerCtx = buildUserCtx(owner.id, 'editor');
      const otherCtx = buildUserCtx(other.id, 'editor');

      const { pageId } = await pageService.create(ownerCtx, { path: 'delete-rev-denied', title: 'T', contentSource: 'v1' });
      await revisionService.publish(ownerCtx, { path: 'delete-rev-denied', version: 1 });
      await pageService.newDraft(ownerCtx, 'delete-rev-denied', { title: 'T', contentSource: 'v2' });
      await revisionService.publish(ownerCtx, { path: 'delete-rev-denied', version: 2 });

      await expect(
        revisionService.remove(otherCtx, { pageId, version: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies anonymous and readers', async () => {
      const editor = await createUser('editor-delrev-deny@example.com', 'editor');
      const reader = await createUser('reader-delrev-deny@example.com', 'reader');
      const editorCtx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(editorCtx, { path: 'delete-rev-deny-anon', title: 'T', contentSource: 'v1' });
      await revisionService.publish(editorCtx, { path: 'delete-rev-deny-anon', version: 1 });
      await pageService.newDraft(editorCtx, 'delete-rev-deny-anon', { title: 'T', contentSource: 'v2' });
      await revisionService.publish(editorCtx, { path: 'delete-rev-deny-anon', version: 2 });

      await expect(
        revisionService.remove(buildAnonymousCtx(), { pageId, version: 1 }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(
        revisionService.remove(buildUserCtx(reader.id, 'reader'), { pageId, version: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('resolves the page by id, not by (space, path) alone, when another page shares the same path', async () => {
      const editor = await createUser('editor-delrev-locale@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId: sourcePageId } = await pageService.create(ctx, {
        path: 'delete-rev-locale',
        title: 'T',
        contentSource: 'v1',
      });
      await revisionService.publish(ctx, { path: 'delete-rev-locale', version: 1 });
      await pageService.newDraft(ctx, 'delete-rev-locale', { title: 'T', contentSource: 'v2' });
      await revisionService.publish(ctx, { path: 'delete-rev-locale', version: 2 });
      const sourceRevision1 = await db.query.pageRevisions.findFirst({
        where: and(eq(schema.pageRevisions.pageId, sourcePageId), eq(schema.pageRevisions.versionNumber, 1)),
      });
      if (!sourceRevision1) throw new Error('Failed to find source revision 1');

      // `pages` is unique on (space_id, path, locale), so a different locale
      // can legitimately share the same path as the page above. A lookup by
      // (spaceId, path) alone would be ambiguous between the two.
      const defaultSpace = await ensureDefaultSpace();
      if (!defaultSpace) throw new Error('Failed to resolve default space');
      const [otherLocalePage] = await db
        .insert(schema.pages)
        .values({
          spaceId: defaultSpace.id,
          slug: 'delete-rev-locale-zh',
          path: 'delete-rev-locale',
          locale: 'zh',
          title: 'T',
          authorId: editor.id,
        })
        .returning();
      if (!otherLocalePage) throw new Error('Failed to create other-locale page');
      const [otherRevision] = await db
        .insert(schema.pageRevisions)
        .values({
          pageId: otherLocalePage.id,
          versionNumber: 1,
          contentSource: 'zh v1',
          contentHtml: '<p>zh v1</p>',
          contentHash: 'zh-v1-hash',
          authorId: editor.id,
          status: 'published',
        })
        .returning();
      if (!otherRevision) throw new Error('Failed to create other-locale revision');
      await db
        .update(schema.pages)
        .set({ currentPublishedVersionId: otherRevision.id, latestVersionId: otherRevision.id })
        .where(eq(schema.pages.id, otherLocalePage.id));

      await revisionService.remove(ctx, { pageId: sourcePageId, version: 1 });

      const deletedSourceRevision = await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, sourceRevision1.id),
      });
      expect(deletedSourceRevision?.deletedAt).toBeTruthy();

      const untouchedOtherRevision = await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, otherRevision.id),
      });
      expect(untouchedOtherRevision?.deletedAt).toBeNull();
    });
  });
});
