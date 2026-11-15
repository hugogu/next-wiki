import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { getPageBreadcrumbs, getPageNavigation } from './page-navigation';
import { createPublicApiUser, ensurePublicApiDefaultSpace } from '../../../test/public-wiki-api-fixtures';
import { getPageTree } from './public-content';

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL client_min_messages = warning`);
    await tx.execute(sql`TRUNCATE users, spaces CASCADE`);
  });
});
afterAll(closeDb);

describe('path-scoped navigation', () => {
  async function fixture() {
    const space = (await ensurePublicApiDefaultSpace())!;
    const admin = await createPublicApiUser('admin@example.com', 'admin');
    const editor = await createPublicApiUser('editor@example.com', 'editor');
    async function page(path: string, visibility: 'public' | 'registered' | 'restricted' = 'public', published = true, authorId = admin.id) {
      const id = randomUUID();
      const revisionId = randomUUID();
      await db.insert(schema.pages).values({ id, path, slug: path.replaceAll('/', '-'), title: `Title ${path}`, spaceId: space.id, visibility, authorId });
      await db.insert(schema.pageRevisions).values({ id: revisionId, pageId: id, versionNumber: 1, status: published ? 'published' : 'draft', authorId, contentSource: '# Body', contentHtml: '<p>Body</p>', contentHash: 'hash' });
      await db.update(schema.pages).set({ latestVersionId: revisionId, currentPublishedVersionId: published ? revisionId : null }).where(sql`${schema.pages.id} = ${id}`);
      return id;
    }
    return { space, admin, editor, page };
  }

  it('returns direct children and virtual folders without descendant payloads', async () => {
    const { page } = await fixture();
    await page('guides');
    await page('guides/install');
    await page('guides/tools/cli');
    await page('guides/tools/deeper/secret');
    await page('unrelated/elsewhere');
    const result = await getPageNavigation(buildAnonymousCtx(), { path: 'guides', mode: 'current', status: 'published' });
    expect(result.root.children).toMatchObject([
      { path: 'guides/install', slug: 'guides-install', hasChildren: false, children: [] },
      { path: 'guides/tools', pageId: null, hasChildren: true, children: [] },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('unrelated');
  });

  it('filters permissions before revealing folder existence and handles draft ownership', async () => {
    const { page, admin, editor } = await fixture();
    await page('public/a');
    await page('registered/a', 'registered');
    await page('restricted/a', 'restricted');
    await page('owned/a', 'public', false, editor.id);
    await page('other/a', 'public', false);
    const actors = [buildAnonymousCtx(), buildUserCtx(editor.id, 'editor'), buildUserCtx(admin.id, 'admin'), buildApiKeyCtx(admin.id, 'admin', ['edit'], 'key')];
    for (const ctx of actors) {
      const scoped = await getPageNavigation(ctx, { path: '', mode: 'current', status: 'all' });
      const full = await getPageTree(ctx, { status: 'all' });
      expect(scoped.root.children.map((node) => node.path)).toEqual(full.root.children.map((node) => node.path));
    }
    const anonymous = await getPageNavigation(actors[0]!, { path: '', mode: 'current', status: 'all' });
    expect(anonymous.root.children.map((node) => node.path)).toEqual(['public']);
  });

  it('uses literal directory prefixes, bounded ancestor levels, and canonical breadcrumb slugs', async () => {
    const { page } = await fixture();
    await page('a_b');
    await page('a_b/install');
    await page('a_b/install/linux');
    await page('axb/wrong');
    const current = await getPageNavigation(buildAnonymousCtx(), { path: 'a_b', mode: 'current', status: 'published' });
    expect(current.root.children.map((node) => node.path)).toEqual(['a_b/install']);
    const tree = await getPageNavigation(buildAnonymousCtx(), { path: 'a_b/install/linux', mode: 'tree', status: 'published' });
    expect(tree.root.children[0]?.children[0]?.children[0]?.path).toBe('a_b/install/linux');
    expect(await getPageBreadcrumbs(buildAnonymousCtx(), 'a_b/install/linux')).toMatchObject([
      { path: 'a_b', title: 'Title a_b', slug: 'a_b' },
      { path: 'a_b/install', title: 'Title a_b/install', slug: 'a_b-install' },
    ]);
  });

  it('keeps response size constant as a different branch grows', async () => {
    const { page, admin, space } = await fixture();
    await page('guides/install');
    const query = { path: 'guides', mode: 'current' as const, status: 'published' as const };
    const before = await getPageNavigation(buildAnonymousCtx(), query);
    const bulk = Array.from({ length: 500 }, (_, i) => ({
      id: randomUUID(), revisionId: randomUUID(), path: `elsewhere/page-${i}`,
    }));
    await db.insert(schema.pages).values(bulk.map(({ id, path, revisionId }) => ({
      id, path, slug: path.replaceAll('/', '-'), title: `Unrelated ${path}`, spaceId: space.id,
      authorId: admin.id, latestVersionId: revisionId, currentPublishedVersionId: revisionId,
    })));
    await db.insert(schema.pageRevisions).values(bulk.map(({ id, revisionId }) => ({
      id: revisionId, pageId: id, versionNumber: 1, contentHash: 'hash', contentSource: '# Body', contentHtml: '<p>Body</p>', authorId: admin.id, status: 'published' as const,
    })));
    const fullBytes = Buffer.byteLength(JSON.stringify(await getPageTree(buildAnonymousCtx(), { status: 'published' })));
    const scopedBytes = Buffer.byteLength(JSON.stringify(await getPageNavigation(buildAnonymousCtx(), query)));
    expect(scopedBytes).toBeLessThan(fullBytes / 100);
    console.info(`Navigation fixture (501 pages): full=${fullBytes} bytes, current=${scopedBytes} bytes`);
    expect(await getPageNavigation(buildAnonymousCtx(), query)).toEqual(before);
  });
});
