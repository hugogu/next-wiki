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

    await createPublishedFixturePage(admin, {
      path: 'scope/public',
      title: 'Public page',
      contentSource: '# Public',
    });
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
      contentSource: '# Owner generated',
      visibility: 'restricted',
    });
    await revisions.publish(ownerKey, { path: 'scope/owner-generated', version: 1 });

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
    await revisions.publish(otherKey, { path: 'scope/other-generated', version: 1 });

    await pageService.create(buildUserCtx(owner.id, 'editor'), {
      path: 'scope/owner-human-generated',
      title: 'Human-generated classification',
      contentSource: '# Human generated',
      nature: 'generated',
      visibility: 'restricted',
    });
    await revisions.publish(buildUserCtx(owner.id, 'editor'), { path: 'scope/owner-human-generated', version: 1 });

    const result = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {});

    expect(result.items.map((item) => item.path).sort()).toEqual([
      'scope/owner-generated',
      'scope/public',
    ]);
    expect(result.items.find((item) => item.path === 'scope/owner-generated')).toMatchObject({ status: 'published' });
    expect(result.items.find((item) => item.path === 'scope/public')).toMatchObject({ status: 'published' });
    expect(result.items.find((item) => item.path === 'scope/public')?.authorEmail).toBe('');
    expect(result.totalItems).toBe(2);

    const emailFiltered = await pageService.listAdminPages(buildUserCtx(owner.id, 'editor'), {
      filters: { author: admin.email },
    });
    expect(emailFiltered.items).toEqual([]);

    const stats = await pageService.getAdminPageStats(buildUserCtx(owner.id, 'editor'));
    expect(stats.totalPages).toBe(2);
    expect(stats.totalEdits).toBe(2);

  });
});
