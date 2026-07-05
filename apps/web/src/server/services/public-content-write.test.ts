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

describe('public content write facade', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates pages, drafts, properties, and publication through shared services', async () => {
    const editor = await createPublicApiUser('public-write-editor@example.com', 'editor');
    const ctx = buildApiKeyCtx(editor.id, 'editor', ['view', 'create', 'edit'], 'editor-key');

    const page = await publicContent.createPage(
      ctx,
      {
        path: 'public/write',
        title: 'Write',
        contentSource: '# Write',
      },
      ['latestRevision'],
    );
    expect(page.status).toBe('draft');

    const draft = await publicContent.createDraft(ctx, page.id, {
      title: 'Write 2',
      contentSource: '# Write 2',
      baseRevisionId: page.latestRevision?.id,
    });
    expect(draft.version).toBe(2);

    const renamed = await publicContent.updateProperties(ctx, page.id, {
      path: 'public/write-renamed',
      title: 'Write Renamed',
      baseRevisionId: draft.id,
    });
    expect(renamed.path).toBe('public/write-renamed');

    const published = await publicContent.publishRevision(ctx, page.id, 2, { expectedRevisionId: draft.id }, ['publishedRevision']);
    expect(published.publishedRevision?.version).toBe(2);
  });

  it('rejects stale base revisions without creating a new draft', async () => {
    const editor = await createPublicApiUser('public-stale-editor@example.com', 'editor');
    const userCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'create', 'edit'], 'editor-key');

    const created = await pageService.create(userCtx, {
      path: 'public/stale',
      title: 'Stale',
      contentSource: 'v1',
    });
    await pageService.newDraft(userCtx, 'public/stale', { title: 'Stale', contentSource: 'v2' });

    await expect(
      publicContent.createDraft(apiCtx, created.pageId, {
        title: 'Stale',
        contentSource: 'v3',
        baseRevisionId: created.versionId,
      }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });
});

describe('public content batch write facade (US5)', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
  });

  async function seedPages(editorCtx: ReturnType<typeof buildUserCtx>, count: number, prefix: string) {
    const pages: Array<{ pageId: string; path: string; baseRevisionId: string }> = [];
    for (let i = 0; i < count; i++) {
      const path = `${prefix}/${i}`;
      const created = await pageService.create(editorCtx, { path, title: `Page ${i}`, contentSource: `# Page ${i}` });
      pages.push({ pageId: created.pageId, path, baseRevisionId: created.versionId });
    }
    return pages;
  }

  it('updates 20 items in one batch, all succeeding with a new revisionId each', async () => {
    const editor = await createPublicApiUser('batch-update-happy-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'edit'], 'editor-key');
    const seeded = await seedPages(editorCtx, 20, 'batch/happy');

    const result = await publicContent.batchUpdatePages(apiCtx, {
      items: seeded.map((p) => ({ pageId: p.pageId, title: `Updated ${p.path}`, baseRevisionId: p.baseRevisionId })),
    }, { dryRun: false });

    expect(result.successCount).toBe(20);
    expect(result.failureCount).toBe(0);
    for (const item of result.results) {
      expect(item.status).toBe('success');
      expect(item.revisionId).toBeTruthy();
    }
  });

  it('reports PAGE_PATH_CONFLICT for one colliding item among 20, the other 19 still succeed', async () => {
    const editor = await createPublicApiUser('batch-update-collision-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'edit'], 'editor-key');
    const seeded = await seedPages(editorCtx, 20, 'batch/collision');

    const items: Array<{ pageId: string; title?: string; path?: string; baseRevisionId: string }> = seeded.map((p) => ({
      pageId: p.pageId, title: `Updated ${p.path}`, baseRevisionId: p.baseRevisionId,
    }));
    // Item 0 tries to rename onto item 1's existing path — a collision.
    items[0] = { ...items[0]!, path: seeded[1]!.path };

    const result = await publicContent.batchUpdatePages(apiCtx, { items }, { dryRun: false });

    expect(result.successCount).toBe(19);
    expect(result.failureCount).toBe(1);
    const failed = result.results.find((r) => r.status === 'failed');
    expect(failed?.error?.code).toBe('PAGE_PATH_CONFLICT');
  });

  it('reports STALE_REVISION for one stale item among 20, the other 19 still succeed', async () => {
    const editor = await createPublicApiUser('batch-update-stale-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'edit'], 'editor-key');
    const seeded = await seedPages(editorCtx, 20, 'batch/stale');

    const items = seeded.map((p) => ({ pageId: p.pageId, title: `Updated ${p.path}`, baseRevisionId: p.baseRevisionId }));
    items[0] = { ...items[0]!, baseRevisionId: '00000000-0000-0000-0000-000000000000' };

    const result = await publicContent.batchUpdatePages(apiCtx, { items }, { dryRun: false });

    expect(result.successCount).toBe(19);
    expect(result.failureCount).toBe(1);
    const failed = result.results.find((r) => r.status === 'failed');
    expect(failed?.error?.code).toBe('STALE_REVISION');
  });

  it('dry_run=true previews the new state without writing to the database', async () => {
    const editor = await createPublicApiUser('batch-update-dryrun-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'edit'], 'editor-key');
    const [seeded] = await seedPages(editorCtx, 1, 'batch/dryrun');

    const result = await publicContent.batchUpdatePages(apiCtx, {
      items: [{ pageId: seeded!.pageId, title: 'Dry Run Title', baseRevisionId: seeded!.baseRevisionId }],
    }, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.results[0]).toMatchObject({ status: 'success', preview: { title: 'Dry Run Title' } });
    expect(result.results[0]?.revisionId).toBeUndefined();

    const page = await publicContent.getPageById(editorCtx, seeded!.pageId);
    expect(page?.title).toBe('Page 0');
  });

  it('rejects a Reader-scoped key at the batch boundary with no per-item inspection', async () => {
    const editor = await createPublicApiUser('batch-update-reader-editor@example.com', 'editor');
    const reader = await createPublicApiUser('batch-update-reader-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const [seeded] = await seedPages(editorCtx, 1, 'batch/reader');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await expect(
      publicContent.batchUpdatePages(readerCtx, {
        items: [{ pageId: seeded!.pageId, title: 'Should not apply', baseRevisionId: seeded!.baseRevisionId }],
      }, { dryRun: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('merges a frontmatter patch, preserving unrelated keys and honoring null-delete', async () => {
    const editor = await createPublicApiUser('batch-update-frontmatter-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'edit'], 'editor-key');

    const created = await pageService.create(editorCtx, {
      path: 'batch/frontmatter-patch',
      title: 'Frontmatter Patch',
      contentSource: '---\ntags: [a]\nstatus: draft\nowner: alice\n---\n\n# Body',
    });

    const result = await publicContent.batchUpdatePages(apiCtx, {
      items: [{
        pageId: created.pageId,
        frontmatter: { status: 'published', owner: null },
        baseRevisionId: created.versionId,
      }],
    }, { dryRun: false });

    expect(result.successCount).toBe(1);
    const page = await publicContent.getPageById(editorCtx, created.pageId);
    expect(page?.frontmatter).toEqual({ tags: ['a'], status: 'published' });
  });
});

describe('public content batch soft-delete facade (US5)', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  async function seedPublished(editorCtx: ReturnType<typeof buildUserCtx>, count: number, prefix: string) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const path = `${prefix}/${i}`;
      const created = await pageService.create(editorCtx, { path, title: `Page ${i}`, contentSource: `# Page ${i}` });
      await revisions.publish(editorCtx, { path, version: 1 });
      ids.push(created.pageId);
    }
    return ids;
  }

  it('soft-deletes 10 items in one batch, all succeeding', async () => {
    const editor = await createPublicApiUser('batch-delete-happy-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'delete'], 'editor-key');
    const ids = await seedPublished(editorCtx, 10, 'batch-del/happy');

    const result = await publicContent.batchSoftDeletePages(apiCtx, { pageIds: ids }, { dryRun: false });

    expect(result.successCount).toBe(10);
    expect(result.failureCount).toBe(0);
    for (const id of ids) {
      expect(await publicContent.getPageById(editorCtx, id)).toBeNull();
    }
  });

  it('reports NOT_FOUND for one already-deleted item among 10, the other 9 still succeed', async () => {
    const editor = await createPublicApiUser('batch-delete-partial-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'delete'], 'editor-key');
    const ids = await seedPublished(editorCtx, 10, 'batch-del/partial');
    // Pre-delete one page so its batch item fails as already-gone.
    const preDeleted = ids[0]!;
    await publicContent.deletePage(editorCtx, preDeleted);

    const result = await publicContent.batchSoftDeletePages(apiCtx, { pageIds: ids }, { dryRun: false });

    expect(result.successCount).toBe(9);
    expect(result.failureCount).toBe(1);
    const failed = result.results.find((r) => r.status === 'failed');
    expect(failed).toMatchObject({ pageId: preDeleted, error: { code: 'NOT_FOUND' } });
  });

  it('dry_run=true previews the deletion without writing to the database', async () => {
    const editor = await createPublicApiUser('batch-delete-dryrun-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'delete'], 'editor-key');
    const ids = await seedPublished(editorCtx, 1, 'batch-del/dryrun');

    const result = await publicContent.batchSoftDeletePages(apiCtx, { pageIds: ids }, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.results[0]).toMatchObject({ status: 'success' });
    expect(await publicContent.getPageById(editorCtx, ids[0]!)).not.toBeNull();
  });

  it('rejects a Reader-scoped key at the batch boundary', async () => {
    const editor = await createPublicApiUser('batch-delete-reader-editor@example.com', 'editor');
    const reader = await createPublicApiUser('batch-delete-reader-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const ids = await seedPublished(editorCtx, 1, 'batch-del/reader');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await expect(
      publicContent.batchSoftDeletePages(readerCtx, { pageIds: ids }, { dryRun: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
