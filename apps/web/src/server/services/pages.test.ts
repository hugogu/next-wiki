import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as pageService from '@/server/services/pages';
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
    .values({
      email,
      passwordHash: 'HASH',
      role,
      status: 'active',
    })
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

describe('pageService US3', () => {
  beforeAll(async () => {
    await cleanup();
    await ensureDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  describe('create', () => {
    it('creates a page with first draft revision and renders markdown', async () => {
      const editor = await createUser('editor-create@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const result = await pageService.create(ctx, {
        slug: 'test-create',
        title: 'Test Create',
        contentSource: '# Hello\n\nThis is **bold**.',
      });

      expect(result.pageId).toBeTruthy();
      expect(result.versionId).toBeTruthy();

      const page = await db.query.pages.findFirst({
        where: eq(schema.pages.id, result.pageId),
      });
      const revision = await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, result.versionId),
      });

      expect(page?.slug).toBe('test-create');
      expect(page?.latestVersionId).toBe(result.versionId);
      expect(revision?.versionNumber).toBe(1);
      expect(revision?.status).toBe('draft');
      expect(revision?.contentHtml).toContain('<h1>Hello</h1>');
      expect(revision?.contentHash).toBeTruthy();
    });

    it('rejects invalid slug format', async () => {
      const editor = await createUser('editor-slug@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await expect(
        pageService.create(ctx, { slug: 'Invalid Slug!', title: 'T', contentSource: 'c' }),
      ).rejects.toThrow('lowercase');
    });

    it('rejects duplicate slug', async () => {
      const editor = await createUser('editor-dup@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { slug: 'dup-slug', title: 'T', contentSource: 'c' });
      await expect(
        pageService.create(ctx, { slug: 'dup-slug', title: 'T2', contentSource: 'c2' }),
      ).rejects.toThrow('already exists');
    });

    it('denies anonymous and readers', async () => {
      const reader = await createUser('reader-create@example.com', 'reader');

      await expect(
        pageService.create(buildAnonymousCtx(), { slug: 'anon', title: 'T', contentSource: 'c' }),
      ).rejects.toThrow('Sign in');

      await expect(
        pageService.create(buildUserCtx(reader.id, 'reader'), { slug: 'reader', title: 'T', contentSource: 'c' }),
      ).rejects.toThrow('permission');
    });
  });

  describe('newDraft', () => {
    it('increments version atomically', async () => {
      const editor = await createUser('editor-draft@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, {
        slug: 'draft-test',
        title: 'Draft Test',
        contentSource: 'v1',
      });

      const result = await pageService.newDraft(ctx, {
        slug: 'draft-test',
        title: 'Draft Test Updated',
        contentSource: 'v2',
      });

      expect(result.versionNumber).toBe(2);

      const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
      expect(page?.latestVersionId).toBe(result.versionId);
      expect(page?.title).toBe('Draft Test Updated');
    });

    it('preserves concurrent last-write-wins revisions', async () => {
      const editor = await createUser('editor-concurrent@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { slug: 'concurrent', title: 'T', contentSource: 'v1' });

      const [a, b] = await Promise.all([
        pageService.newDraft(ctx, { slug: 'concurrent', title: 'T', contentSource: 'v2' }),
        pageService.newDraft(ctx, { slug: 'concurrent', title: 'T', contentSource: 'v3' }),
      ]);

      expect(new Set([a.versionNumber, b.versionNumber]).size).toBe(2);
    });

    it('denies reader', async () => {
      const editor = await createUser('editor-denied@example.com', 'editor');
      const reader = await createUser('reader-denied@example.com', 'reader');
      const editorCtx = buildUserCtx(editor.id, 'editor');
      const readerCtx = buildUserCtx(reader.id, 'reader');

      await pageService.create(editorCtx, { slug: 'denied-edit', title: 'T', contentSource: 'c' });

      await expect(
        pageService.newDraft(readerCtx, { slug: 'denied-edit', title: 'T2', contentSource: 'c2' }),
      ).rejects.toThrow('permission');
    });
  });

  describe('getForEdit', () => {
    it('returns latest source for editor', async () => {
      const editor = await createUser('editor-getedit@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { slug: 'get-edit', title: 'T', contentSource: 'source' });

      const view = await pageService.getForEdit(ctx, 'get-edit');
      expect(view?.contentSource).toBe('source');
    });

    it('returns null for reader', async () => {
      const editor = await createUser('editor-getedit2@example.com', 'editor');
      const reader = await createUser('reader-getedit@example.com', 'reader');
      await pageService.create(buildUserCtx(editor.id, 'editor'), { slug: 'get-edit2', title: 'T', contentSource: 'c' });

      const view = await pageService.getForEdit(buildUserCtx(reader.id, 'reader'), 'get-edit2');
      expect(view).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('lists revisions newest first', async () => {
      const editor = await createUser('editor-history@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { slug: 'history-test', title: 'T', contentSource: 'v1' });
      await pageService.newDraft(ctx, { slug: 'history-test', title: 'T', contentSource: 'v2' });

      const history = await pageService.getHistory(ctx, 'history-test');
      expect(history).toHaveLength(2);
      expect(history[0]?.version).toBe(2);
      expect(history[1]?.version).toBe(1);
    });
  });

  describe('getRevision', () => {
    it('returns revision source and html', async () => {
      const editor = await createUser('editor-rev@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { slug: 'rev-test', title: 'T', contentSource: '# One' });

      const rev = await pageService.getRevision(ctx, 'rev-test', 1);
      expect(rev?.contentSource).toBe('# One');
      expect(rev?.contentHtml).toContain('<h1>One</h1>');
    });
  });
});
