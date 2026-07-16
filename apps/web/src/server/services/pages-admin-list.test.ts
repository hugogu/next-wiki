import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
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

describe('listAdminPages tags', () => {
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
});
