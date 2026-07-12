import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { materializeGitExport } from './export';

const ids = {
  user: randomUUID(),
  space: randomUUID(),
  page: randomUUID(),
  revision: randomUUID(),
  asset: randomUUID(),
};

describe('Git export materialization', () => {
  beforeAll(async () => {
    await db.insert(schema.users).values({
      id: ids.user,
      email: `git-export-${ids.user}@example.com`,
      passwordHash: 'HASH',
      role: 'admin',
    });
    await db.insert(schema.spaces).values({
      id: ids.space,
      slug: `git-export-${ids.space}`,
      name: 'Git Export Test',
      anonymousRead: true,
    });
    await db.insert(schema.pages).values({
      id: ids.page,
      spaceId: ids.space,
      slug: 'guide',
      path: 'docs/guide',
      title: 'Guide',
      authorId: ids.user,
      currentPublishedVersionId: ids.revision,
      latestVersionId: ids.revision,
    });
    await db.insert(schema.pageRevisions).values({
      id: ids.revision,
      pageId: ids.page,
      versionNumber: 1,
      contentSource: `# Guide\n\n![image](/api/assets/${ids.asset})`,
      contentHtml: '<h1>Guide</h1>',
      contentHash: 'markdown-hash',
      authorId: ids.user,
      status: 'published',
      publishedAt: new Date('2026-01-02T03:04:05.000Z'),
    });
    await db.insert(schema.contentAssets).values({
      id: ids.asset,
      contentHash: 'asset-hash',
      contentType: 'image/png',
      sizeBytes: 4,
      createdBy: ids.user,
    });
    await db.insert(schema.contentBlobs).values({
      assetId: ids.asset,
      bytes: Buffer.from([1, 2, 3, 4]),
    });
    await db.insert(schema.contentAssetRefs).values({
      revisionId: ids.revision,
      assetId: ids.asset,
    });
  });

  afterAll(async () => {
    await db.delete(schema.contentAssetRefs).where(eq(schema.contentAssetRefs.revisionId, ids.revision));
    await db.delete(schema.contentBlobs).where(eq(schema.contentBlobs.assetId, ids.asset));
    await db.delete(schema.contentAssets).where(eq(schema.contentAssets.id, ids.asset));
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.id, ids.revision));
    await db.delete(schema.pages).where(eq(schema.pages.id, ids.page));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, ids.space));
    await db.delete(schema.users).where(eq(schema.users.id, ids.user));
    await closeDb();
  });

  it('preserves synchronized metadata frontmatter verbatim in exported Markdown', async () => {
    const source = '---\ntitle: Guide\ntags: [devops]\nsummary: Exported summary\n---\n\n# Guide';
    await db.update(schema.pageRevisions).set({ contentSource: source, contentHtml: '<h1>Guide</h1>' }).where(eq(schema.pageRevisions.id, ids.revision));
    const directory = await mkdtemp(join(tmpdir(), 'next-wiki-export-metadata-'));
    try {
      await materializeGitExport(directory, { assetsDir: 'assets' });
      expect(await readFile(join(directory, 'docs/guide.md'), 'utf8')).toContain('summary: Exported summary');
    } finally {
      await rm(directory, { recursive: true, force: true });
      await db.update(schema.pageRevisions).set({
        contentSource: `# Guide\n\n![image](/api/assets/${ids.asset})`, contentHtml: '<h1>Guide</h1>',
      }).where(eq(schema.pageRevisions.id, ids.revision));
    }
  });

  it('writes standard Markdown frontmatter and referenced image files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'next-wiki-export-test-'));
    try {
      const result = await materializeGitExport(directory, { assetsDir: 'assets' });
      expect(result).toEqual({ pages: 1, assets: 1 });

      const markdown = await readFile(join(directory, 'docs/guide.md'), 'utf8');
      expect(markdown).toContain('title: "Guide"');
      expect(markdown).toContain('publishedAt: "2026-01-02T03:04:05.000Z"');
      expect(markdown).toContain(`../assets/${ids.asset}.png`);
      expect(await readFile(join(directory, 'assets', `${ids.asset}.png`))).toEqual(
        Buffer.from([1, 2, 3, 4]),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('excludes soft-deleted pages and assets they alone referenced', async () => {
    const extra = { page: randomUUID(), revision: randomUUID(), asset: randomUUID() };
    await db.insert(schema.contentAssets).values({
      id: extra.asset,
      contentHash: 'deleted-asset-hash',
      contentType: 'image/png',
      sizeBytes: 2,
      createdBy: ids.user,
    });
    await db.insert(schema.contentBlobs).values({
      assetId: extra.asset,
      bytes: Buffer.from([9, 9]),
    });
    await db.insert(schema.pages).values({
      id: extra.page,
      spaceId: ids.space,
      slug: 'obsolete',
      path: 'docs/obsolete',
      title: 'Obsolete',
      authorId: ids.user,
      currentPublishedVersionId: extra.revision,
      latestVersionId: extra.revision,
      deletedAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    await db.insert(schema.pageRevisions).values({
      id: extra.revision,
      pageId: extra.page,
      versionNumber: 1,
      contentSource: `# Obsolete\n\n![image](/api/assets/${extra.asset})`,
      contentHtml: '<h1>Obsolete</h1>',
      contentHash: 'obsolete-hash',
      authorId: ids.user,
      status: 'published',
      publishedAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    await db.insert(schema.contentAssetRefs).values({
      revisionId: extra.revision,
      assetId: extra.asset,
    });

    const directory = await mkdtemp(join(tmpdir(), 'next-wiki-export-test-'));
    try {
      // A fresh checkout plus this snapshot is how the job prunes removed
      // content: deleted pages and the assets only they referenced never appear.
      const result = await materializeGitExport(directory, { assetsDir: 'assets' });
      expect(result).toEqual({ pages: 1, assets: 1 });
      await expect(readFile(join(directory, 'docs/obsolete.md'), 'utf8')).rejects.toThrow();
      await expect(readFile(join(directory, 'assets', `${extra.asset}.png`))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
      await db.delete(schema.contentAssetRefs).where(eq(schema.contentAssetRefs.revisionId, extra.revision));
      await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.id, extra.revision));
      await db.delete(schema.pages).where(eq(schema.pages.id, extra.page));
      await db.delete(schema.contentBlobs).where(eq(schema.contentBlobs.assetId, extra.asset));
      await db.delete(schema.contentAssets).where(eq(schema.contentAssets.id, extra.asset));
    }
  });
});
