import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import {
  createPublicApiUser,
  createPublishedFixturePage,
  ensurePublicApiDefaultSpace,
} from '../../../test/public-wiki-api-fixtures';

async function cleanup() {
  await db.delete(schema.pageRevisionTags);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.tags);
  await db.delete(schema.users);
}

describe('listAdminPages', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it("includes each page's latest-revision tags", async () => {
    const admin = await createPublicApiUser('admin-list-tags@example.com', 'admin');
    await createPublishedFixturePage(admin, {
      path: 'admin/list-tags',
      title: 'Tagged',
      contentSource: '---\ntitle: Tagged\ntags:\n  - alpha\n  - beta\n---\n\n# Tagged',
    });

    const result = await pageService.listAdminPages(buildUserCtx(admin.id, 'admin'), {});
    const item = result.items.find((row) => row.path === 'admin/list-tags');
    expect(item).toBeDefined();
    expect(item!.tags.map((tag) => tag.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('distinguishes unpublished pages from published pages with a pending draft', async () => {
    const admin = await createPublicApiUser('admin-list-drafts@example.com', 'admin');
    const ctx = buildUserCtx(admin.id, 'admin');
    await pageService.create(ctx, {
      path: 'admin/first-draft',
      title: 'First draft',
      contentSource: '# First draft',
    });
    await createPublishedFixturePage(admin, {
      path: 'admin/published-draft',
      title: 'Published draft',
      contentSource: '# Published',
    });
    const published = await pageService.getForEdit(ctx, 'admin/published-draft');
    await pageService.newDraft(ctx, 'admin/published-draft', {
      title: 'Published draft',
      contentSource: '# Pending update',
      baseRevisionId: published!.revisionId,
    });

    const result = await pageService.listAdminPages(ctx, {});
    const firstDraft = result.items.find((row) => row.path === 'admin/first-draft');
    const pendingUpdate = result.items.find((row) => row.path === 'admin/published-draft');

    expect(firstDraft).toMatchObject({ status: 'draft', latestVersion: 1 });
    expect(pendingUpdate).toMatchObject({ status: 'published_with_draft', latestVersion: 2 });
  });

  it('limits a signed-in non-admin to public pages and machine-generated pages from the same account', async () => {
    const admin = await createPublicApiUser('admin-list-scope-admin@example.com', 'admin');
    const owner = await createPublicApiUser('admin-list-scope-owner@example.com', 'editor');
    const other = await createPublicApiUser('admin-list-scope-other@example.com', 'editor');

    const publicPage = await createPublishedFixturePage(admin, {
      path: 'scope/public',
      title: 'Public page',
      contentSource: '---\ntags:\n  - scoped\n---\n\n# Public',
    });
    const publicDraft = await pageService.getForEdit(buildUserCtx(admin.id, 'admin'), 'scope/public');
    if (!publicDraft) throw new Error('Failed to load the published public page');
    const publishedAt = new Date('2020-01-01T00:00:00.000Z');
    await db
      .update(schema.pageRevisions)
      .set({ publishedAt })
      .where(eq(schema.pageRevisions.id, publicPage.versionId));
    await pageService.newDraft(buildUserCtx(admin.id, 'admin'), 'scope/public', {
      title: 'Public page',
      contentSource: '# Unpublished change',
      baseRevisionId: publicDraft.revisionId,
    });
    await db
      .update(schema.pages)
      .set({ updatedAt: new Date('2030-01-01T00:00:00.000Z') })
      .where(eq(schema.pages.id, publicPage.pageId));
    await pageService.create(buildUserCtx(admin.id, 'admin'), {
      path: 'scope/registered',
      title: 'Registered page',
      contentSource: '# Registered',
      visibility: 'registered',
    });
    await revisions.publish(buildUserCtx(admin.id, 'admin'), { path: 'scope/registered', version: 1 });

    const ownerKey = buildApiKeyCtx(
      owner.id,
      'editor',
      ['create', 'edit'],
      '00000000-0000-4000-8000-000000000001',
    );
    await pageService.create(ownerKey, {
      path: 'scope/owner-generated',
      title: 'Owner-generated page',
      contentSource: '---\ntags:\n  - scoped\n---\n\n# Owner generated',
      visibility: 'registered',
    });
    await revisions.publish(buildUserCtx(owner.id, 'editor'), { path: 'scope/owner-generated', version: 1 });
    await pageService.create(ownerKey, {
      path: 'scope/owner-restricted-generated',
      title: 'Owner restricted generated page',
      contentSource: '---\ntags:\n  - scoped\n---\n\n# Owner restricted generated',
      visibility: 'restricted',
    });
    await revisions.publish(buildUserCtx(owner.id, 'editor'), { path: 'scope/owner-restricted-generated', version: 1 });

    const otherKey = buildApiKeyCtx(
      other.id,
      'editor',
      ['create', 'edit'],
      '00000000-0000-4000-8000-000000000002',
    );
    await pageService.create(otherKey, {
      path: 'scope/other-generated',
      title: 'Other-generated page',
      contentSource: '# Other generated',
      visibility: 'restricted',
    });
    await revisions.publish(buildUserCtx(other.id, 'editor'), { path: 'scope/other-generated', version: 1 });

    const ownerHumanGenerated = await pageService.create(buildUserCtx(owner.id, 'editor'), {
      path: 'scope/owner-human-generated',
      title: 'Human-generated classification',
      contentSource: '# Human generated',
      nature: 'generated',
      visibility: 'registered',
    });
    await revisions.publish(buildUserCtx(owner.id, 'editor'), { path: 'scope/owner-human-generated', version: 1 });
    await pageService.newDraft(ownerKey, 'scope/owner-human-generated', {
      title: 'Human-generated classification',
      contentSource: '# Later API-key update',
      baseRevisionId: ownerHumanGenerated.versionId,
    });
    await revisions.publish(buildUserCtx(owner.id, 'editor'), { path: 'scope/owner-human-generated', version: 2 });

    const result = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {});

    expect(result.items.map((item) => item.path).sort()).toEqual([
      'scope/owner-generated',
      'scope/public',
    ]);
    expect(result.items.find((item) => item.path === 'scope/owner-generated')).toMatchObject({ status: 'published' });
    expect(result.items.find((item) => item.path === 'scope/public')).toMatchObject({
      status: 'published',
      editCount: 1,
      updatedAt: publishedAt.toISOString(),
    });
    expect(result.items.map((item) => item.path)).toEqual(['scope/owner-generated', 'scope/public']);
    expect(result.items.find((item) => item.path === 'scope/public')?.authorEmail).toBe('');
    expect(result.totalItems).toBe(2);

    const scopedTag = await db.query.tags.findFirst({
      where: eq(schema.tags.normalizedName, 'scoped'),
    });
    if (!scopedTag) throw new Error('Expected scoped tag');
    const tagPages = await pageService.listAdminTagPages(buildUserCtx(owner.id, 'editor'), {
      tagId: scopedTag.id,
    });
    expect(tagPages.map((item) => item.path).sort()).toEqual([
      'scope/owner-generated',
      'scope/public',
    ]);

    const emailFiltered = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {
      filters: { author: admin.email },
    });
    expect(emailFiltered.items).toEqual([]);

    const draftDateFiltered = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {
      filters: { dateFrom: '2029-01-01' },
    });
    expect(draftDateFiltered.items).toEqual([]);

    const editsSorted = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {
      sort: 'edits',
    });
    expect(editsSorted.items.find((item) => item.path === 'scope/public')).toMatchObject({ editCount: 1 });

    const stats = await pageService.getAdminPageStats(buildUserCtx(owner.id, 'editor'));
    expect(stats.totalPages).toBe(2);
    expect(stats.totalEdits).toBe(2);

    const publicRevision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, publicPage.versionId),
    });
    if (!publicRevision) throw new Error('Failed to load the published revision');
    await db
      .update(schema.pageRevisions)
      .set({ publishedAt: null })
      .where(eq(schema.pageRevisions.id, publicPage.versionId));
    const missingPublishedAt = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {});
    expect(missingPublishedAt.items.find((item) => item.path === 'scope/public')).toMatchObject({
      updatedAt: publicRevision.createdAt.toISOString(),
    });

    await createPublishedFixturePage(other, {
      path: 'scope/other-public',
      title: 'Other public page',
      contentSource: '# Other public',
    });
    const publicAuthors = [
      { id: admin.id, path: 'scope/public' },
      { id: other.id, path: 'scope/other-public' },
    ].sort((left, right) => left.id.localeCompare(right.id));
    await db
      .update(schema.users)
      .set({ email: 'z-readonly-sort@example.com' })
      .where(eq(schema.users.id, publicAuthors[0]!.id));
    await db
      .update(schema.users)
      .set({ email: 'a-readonly-sort@example.com' })
      .where(eq(schema.users.id, publicAuthors[1]!.id));
    const authorSorted = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {
      sort: 'author',
      direction: 'asc',
    });
    expect(authorSorted.items
      .filter((item) => item.path === 'scope/public' || item.path === 'scope/other-public')
      .map((item) => item.path))
      .toEqual(publicAuthors.map((author) => author.path));

  });
});
