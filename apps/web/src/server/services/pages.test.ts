import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { publicPageCreateInputSchema } from '@next-wiki/shared';

const taggedMarkdown = '---\ntitle: Canonical\ndate: 2026-07-10\ntags: [DevOps]\nsummary: Authored summary\nowner: docs\n---\n\n# Body';

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

describe('publicPageCreateInputSchema', () => {
  it('defaults contentSource to an empty string when omitted', () => {
    const result = publicPageCreateInputSchema.parse({ path: 'schema-test-a', title: 'A Title' });
    expect(result.contentSource).toBe('');
  });

  it('accepts an explicit empty contentSource', () => {
    const result = publicPageCreateInputSchema.parse({
      path: 'schema-test-b',
      title: 'A Title',
      contentSource: '',
    });
    expect(result.contentSource).toBe('');
  });

  it('still accepts non-empty contentSource unchanged', () => {
    const result = publicPageCreateInputSchema.parse({
      path: 'schema-test-c',
      title: 'A Title',
      contentSource: '# Hello',
    });
    expect(result.contentSource).toBe('# Hello');
  });
});

describe('pageService US3', () => {
  beforeAll(async () => {
    await cleanup();
    await ensureDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('create', () => {
    it('creates a page with first draft revision and renders markdown', async () => {
      const editor = await createUser('editor-create@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const result = await pageService.create(ctx, {
        path: 'test-create',
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

      expect(page?.path).toBe('test-create');
      expect(page?.latestVersionId).toBe(result.versionId);
      expect(revision?.versionNumber).toBe(1);
      expect(revision?.status).toBe('draft');
      expect(revision?.contentHtml).toContain('<h1 data-line="1">Hello</h1>');
      expect(revision?.contentHash).toBeTruthy();
    });

    it('creates a nested path', async () => {
      const editor = await createUser('editor-nested@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const result = await pageService.create(ctx, {
        path: 'docs/intro',
        title: 'Intro',
        contentSource: 'hello',
      });

      const page = await db.query.pages.findFirst({
        where: eq(schema.pages.id, result.pageId),
      });
      expect(page?.path).toBe('docs/intro');
      expect(page?.slug).toBe('intro');
    });

    it('stores the body verbatim in the wiki space: OKF injection is generated-only', async () => {
      const editor = await createUser('editor-no-okf@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');
      const body = '# Plain\n\nNo frontmatter, no type.';

      const result = await pageService.create(ctx, {
        path: 'no-okf',
        title: 'No OKF',
        contentSource: body,
      });

      const revision = await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, result.versionId),
      });
      expect(revision?.contentSource).toBe(body);
      expect(revision?.contentSource).not.toContain('type:');
    });

    it('rejects invalid path format', async () => {
      const editor = await createUser('editor-slug@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await expect(
        pageService.create(ctx, { path: 'Invalid Path!', title: 'T', contentSource: 'c' }),
      ).rejects.toThrow('lowercase');
    });

    it('rejects duplicate path', async () => {
      const editor = await createUser('editor-dup@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { path: 'dup-path', title: 'T', contentSource: 'c' });
      await expect(
        pageService.create(ctx, { path: 'dup-path', title: 'T2', contentSource: 'c2' }),
      ).rejects.toThrow('already exists');
    });

    it('rejects paths that shadow a built-in app route', async () => {
      const editor = await createUser('editor-reserved@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      // Each of these maps to a real page.tsx / route.ts in apps/web/app/.
      // A wiki page at any of these paths would never be reachable, so the
      // service rejects them up front rather than letting users shoot
      // themselves in the foot.
      const reserved = [
        { path: 'new', label: '/new' },
        { path: 'admin/users', label: '/admin/users' },
        { path: 'api/v1/pages', label: '/api/v1/pages' },
        { path: 'auth/login', label: '/auth/login' },
        { path: 'forbidden', label: '/forbidden' },
        { path: 'healthz', label: '/healthz' },
        { path: 'readyz', label: '/readyz' },
        { path: 'setup', label: '/setup' },
      ];

      for (const { path, label } of reserved) {
        await expect(
          pageService.create(ctx, { path, title: 'T', contentSource: 'c' }),
          `expected ${label} to be rejected`,
        ).rejects.toMatchObject({ code: 'PAGE_PATH_RESERVED' });
      }

      // Paths under catch-all editor routes (e.g. /edit/foo) are also reserved.
      await expect(
        pageService.create(ctx, { path: 'edit/anything', title: 'T', contentSource: 'c' }),
      ).rejects.toMatchObject({ code: 'PAGE_PATH_RESERVED' });

      // And /edit alone is fine — there is no static /edit route, only
      // /edit/[...path]/page.tsx.
      const result = await pageService.create(ctx, {
        path: 'edit',
        title: 'Edit',
        contentSource: 'c',
      });
      expect(result.pageId).toBeTruthy();
    });

    it('denies anonymous and readers', async () => {
      const reader = await createUser('reader-create@example.com', 'reader');

      await expect(
        pageService.create(buildAnonymousCtx(), { path: 'anon', title: 'T', contentSource: 'c' }),
      ).rejects.toThrow('Sign in');

      await expect(
        pageService.create(buildUserCtx(reader.id, 'reader'), { path: 'reader', title: 'T', contentSource: 'c' }),
      ).rejects.toThrow('permission');
    });

    it('creates a page with empty content', async () => {
      const editor = await createUser('editor-empty-content@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const result = await pageService.create(ctx, {
        path: 'empty-content-test',
        title: 'Empty Draft',
        contentSource: '',
      });

      const revision = await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, result.versionId),
      });
      expect(revision?.contentSource).toBe('');
      expect(revision?.status).toBe('draft');
    });
  });

  describe('newDraft', () => {
    it('increments version atomically', async () => {
      const editor = await createUser('editor-draft@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      const { pageId } = await pageService.create(ctx, {
        path: 'draft-test',
        title: 'Draft Test',
        contentSource: 'v1',
      });

      const result = await pageService.newDraft(ctx, 'draft-test', {
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

      await pageService.create(ctx, { path: 'concurrent', title: 'T', contentSource: 'v1' });

      const [a, b] = await Promise.all([
        pageService.newDraft(ctx, 'concurrent', { title: 'T', contentSource: 'v2' }),
        pageService.newDraft(ctx, 'concurrent', { title: 'T', contentSource: 'v3' }),
      ]);

      expect(new Set([a.versionNumber, b.versionNumber]).size).toBe(2);
    });

    it('denies reader', async () => {
      const editor = await createUser('editor-denied@example.com', 'editor');
      const reader = await createUser('reader-denied@example.com', 'reader');
      const editorCtx = buildUserCtx(editor.id, 'editor');
      const readerCtx = buildUserCtx(reader.id, 'reader');

      await pageService.create(editorCtx, { path: 'denied-edit', title: 'T', contentSource: 'c' });

      await expect(
        pageService.newDraft(readerCtx, 'denied-edit', { title: 'T2', contentSource: 'c2' }),
      ).rejects.toThrow('permission');
    });
  });

  describe('getForEdit', () => {
    it('returns latest source for editor', async () => {
      const editor = await createUser('editor-getedit@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { path: 'get-edit', title: 'T', contentSource: 'source' });

      const view = await pageService.getForEdit(ctx, 'get-edit');
      expect(view?.contentSource).toBe('source');
      // The authoring editor may delete their own page.
      expect(view?.canDelete).toBe(true);
    });

    it('withholds canDelete from a non-author editor', async () => {
      const author = await createUser('editor-getedit-author@example.com', 'editor');
      const other = await createUser('editor-getedit-other@example.com', 'editor');
      await pageService.create(buildUserCtx(author.id, 'editor'), { path: 'get-edit-del', title: 'T', contentSource: 'c' });

      const view = await pageService.getForEdit(buildUserCtx(other.id, 'editor'), 'get-edit-del');
      expect(view?.canDelete).toBe(false);
    });

    it('returns null for reader', async () => {
      const editor = await createUser('editor-getedit2@example.com', 'editor');
      const reader = await createUser('reader-getedit@example.com', 'reader');
      await pageService.create(buildUserCtx(editor.id, 'editor'), { path: 'get-edit2', title: 'T', contentSource: 'c' });

      const view = await pageService.getForEdit(buildUserCtx(reader.id, 'reader'), 'get-edit2');
      expect(view).toBeNull();
    });

    it('persists the frontmatter-embedding preference: explicit on save, derived on create', async () => {
      const editor = await createUser('editor-getedit-fm@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      // Plain content → derived preference is off.
      await pageService.create(ctx, { path: 'fm-pref', title: 'T', contentSource: 'body' });
      let view = await pageService.getForEdit(ctx, 'fm-pref');
      expect(view?.writeMetadataToFrontmatter).toBe(false);

      // An explicit editor save overrides the derivation and persists it.
      await pageService.newDraft(ctx, 'fm-pref', {
        title: 'T',
        contentSource: 'body',
        baseRevisionId: view!.revisionId,
        writeMetadataToFrontmatter: true,
      });
      view = await pageService.getForEdit(ctx, 'fm-pref');
      expect(view?.writeMetadataToFrontmatter).toBe(true);

      // A writer that omits the flag (API/AI) derives it from the content.
      await pageService.newDraft(ctx, 'fm-pref', {
        title: 'T',
        contentSource: 'plain body without frontmatter',
        baseRevisionId: view!.revisionId,
      });
      view = await pageService.getForEdit(ctx, 'fm-pref');
      expect(view?.writeMetadataToFrontmatter).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('lists revisions newest first', async () => {
      const editor = await createUser('editor-history@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { path: 'history-test', title: 'T', contentSource: 'v1' });
      await pageService.newDraft(ctx, 'history-test', { title: 'T', contentSource: 'v2' });

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

      await pageService.create(ctx, { path: 'rev-test', title: 'T', contentSource: '# One' });

      const rev = await pageService.getRevision(ctx, 'rev-test', 1);
      expect(rev?.contentSource).toBe('# One');
      expect(rev?.contentHtml).toContain('<h1 data-line="1">One</h1>');
    });
  });

  describe('remove', () => {
    it('soft-deletes a page for the author', async () => {
      const editor = await createUser('editor-delete@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { path: 'delete-me', title: 'T', contentSource: 'c' });
      await pageService.remove(ctx, 'delete-me');

      const page = await db.query.pages.findFirst({
        where: eq(schema.pages.path, 'delete-me'),
      });
      expect(page?.deletedAt).not.toBeNull();
      expect(await pageService.getLive(ctx, 'delete-me')).toBeNull();
    });

    it('allows admin to delete any page', async () => {
      const editor = await createUser('editor-delete-admin@example.com', 'editor');
      const admin = await createUser('admin-delete@example.com', 'admin');

      await pageService.create(buildUserCtx(editor.id, 'editor'), {
        path: 'delete-admin',
        title: 'T',
        contentSource: 'c',
      });
      await pageService.remove(buildUserCtx(admin.id, 'admin'), 'delete-admin');

      const page = await db.query.pages.findFirst({
        where: eq(schema.pages.path, 'delete-admin'),
      });
      expect(page?.deletedAt).not.toBeNull();
    });

    it('denies non-author editors and readers', async () => {
      const author = await createUser('author-delete@example.com', 'editor');
      const other = await createUser('other-delete@example.com', 'editor');
      const reader = await createUser('reader-delete@example.com', 'reader');

      await pageService.create(buildUserCtx(author.id, 'editor'), {
        path: 'deny-delete',
        title: 'T',
        contentSource: 'c',
      });

      await expect(pageService.remove(buildUserCtx(other.id, 'editor'), 'deny-delete')).rejects.toThrow(
        'permission',
      );
      await expect(pageService.remove(buildUserCtx(reader.id, 'reader'), 'deny-delete')).rejects.toThrow(
        'permission',
      );
    });
  });

  describe('updateProperties', () => {
    it('rejects renames that would shadow a built-in app route', async () => {
      const editor = await createUser('editor-rename-reserved@example.com', 'editor');
      const ctx = buildUserCtx(editor.id, 'editor');

      await pageService.create(ctx, { path: 'rename-source', title: 'T', contentSource: 'c' });

      await expect(
        pageService.updateProperties(ctx, 'rename-source', { path: 'new' }),
      ).rejects.toMatchObject({ code: 'PAGE_PATH_RESERVED' });

      await expect(
        pageService.updateProperties(ctx, 'rename-source', { path: 'api/v1/pages' }),
      ).rejects.toMatchObject({ code: 'PAGE_PATH_RESERVED' });
    });
  });
});

describe('getPublishedForShare', () => {
  beforeAll(async () => { await cleanup(); await ensureDefaultSpace(); });
  afterAll(async () => { await cleanup(); });

  async function publish(ctx: ReturnType<typeof buildUserCtx>, path: string, title: string, source: string) {
    const created = await pageService.create(ctx, { path, title, contentSource: source });
    await db.update(schema.pageRevisions)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(schema.pageRevisions.id, created.versionId));
    await db.update(schema.pages)
      .set({ currentPublishedVersionId: created.versionId })
      .where(eq(schema.pages.id, created.pageId));
    return created.pageId;
  }

  it('returns the published revision for any visitor, without a permission ctx', async () => {
    const editor = await createUser('share-pub@example.com', 'editor');
    const pageId = await publish(buildUserCtx(editor.id, 'editor'), 'share-published', 'Shared', '# Hello share');
    const shared = await pageService.getPublishedForShare(pageId);
    expect(shared?.status).toBe('published');
    expect(shared?.title).toBe('Shared');
    expect(shared?.contentHtml).toContain('Hello share');
  });

  it('returns null for a draft-only (never published) page', async () => {
    const editor = await createUser('share-draft@example.com', 'editor');
    const created = await pageService.create(buildUserCtx(editor.id, 'editor'), {
      path: 'share-draft', title: 'Draft', contentSource: 'draft body',
    });
    expect(await pageService.getPublishedForShare(created.pageId)).toBeNull();
  });

  it('returns null for a soft-deleted page', async () => {
    const editor = await createUser('share-del@example.com', 'editor');
    const pageId = await publish(buildUserCtx(editor.id, 'editor'), 'share-deleted', 'Deleted', 'body');
    await db.update(schema.pages).set({ deletedAt: new Date() }).where(eq(schema.pages.id, pageId));
    expect(await pageService.getPublishedForShare(pageId)).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await pageService.getPublishedForShare('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('page metadata projections', () => {
  beforeAll(async () => { await cleanup(); await ensureDefaultSpace(); });
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('synchronizes supported frontmatter into a revision snapshot and rejects stale metadata writes', async () => {
    const editor = await createUser('metadata-page@example.com', 'editor');
    const ctx = buildUserCtx(editor.id, 'editor');
    const created = await pageService.create(ctx, {
      path: 'metadata-page', title: 'Fallback',
      contentSource: taggedMarkdown,
    });
    const live = await pageService.getLive(ctx, 'metadata-page');
    expect(live).toMatchObject({ title: 'Canonical', metadata: { date: '2026-07-10', summary: 'Authored summary' } });
    expect(live?.metadata.tags.map((tag) => tag.normalizedName)).toEqual(['devops']);
    await expect(pageService.newDraft(ctx, 'metadata-page', {
      title: 'Canonical', contentSource: '# stale', baseRevisionId: '00000000-0000-0000-0000-000000000000',
    })).rejects.toThrow('changed');
    expect(created.versionId).toBe(live?.revisionId);
  });

  it('uses an authored summary before the generated list fallback', async () => {
    const editor = await createUser('metadata-summary@example.com', 'editor');
    const ctx = buildUserCtx(editor.id, 'editor');
    await pageService.create(ctx, { path: 'with-summary', title: 'With summary', contentSource: '---\nsummary: Preferred text\n---\n\n# Long body' });
    await pageService.create(ctx, { path: 'without-summary', title: 'Without summary', contentSource: '# Generated fallback body' });
    const revisions = await db.select().from(schema.pageRevisions);
    for (const revision of revisions) await db.update(schema.pageRevisions).set({ status: 'published', publishedAt: new Date() }).where(eq(schema.pageRevisions.id, revision.id));
    const pages = await db.select().from(schema.pages);
    for (const page of pages) await db.update(schema.pages).set({ currentPublishedVersionId: page.latestVersionId }).where(eq(schema.pages.id, page.id));
    const summaries = await pageService.listPublished(ctx);
    expect(summaries.find((item) => item.path === 'with-summary')?.description).toBe('Preferred text');
    expect(summaries.find((item) => item.path === 'without-summary')?.description).toContain('Generated fallback');
  });
});
