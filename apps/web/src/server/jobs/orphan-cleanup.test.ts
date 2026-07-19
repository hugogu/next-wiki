import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import { truncateStorageTables } from '../../../test/content-storage-fixtures';
import * as schema from '@/server/db/schema';
import { seedDefaultStorageBackend } from '@/server/seed';
import { LocalStore } from '@/server/content-store/local-store';
import { runOrphanCleanup } from './orphan-cleanup';

let baseDir: string;
let userId: string;
let spaceId: string;

const TWO_DAYS_AGO = () => new Date(Date.now() - 48 * 60 * 60 * 1000);

async function makeAsset(opts: { createdAt?: Date }): Promise<string> {
  const [asset] = await db
    .insert(schema.contentAssets)
    .values({
      kind: 'image',
      contentHash: 'h',
      contentType: 'image/png',
      sizeBytes: 3,
      createdBy: userId,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning();
  await db.insert(schema.contentBlobs).values({ assetId: asset!.id, bytes: Buffer.from([1, 2, 3]) });
  return asset!.id;
}

async function clearContent() {
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssets);
}

beforeAll(async () => {
  await truncateStorageTables();
  baseDir = mkdtempSync(path.join(tmpdir(), 'nw-orphan-'));
  await clearContent();
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  const [space] = await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' }).returning();
  spaceId = space!.id;
  const [user] = await db.insert(schema.users).values({ email: 'orph@example.com', passwordHash: 'H', role: 'admin' }).returning();
  userId = user!.id;
});

afterAll(async () => {
  rmSync(baseDir, { recursive: true, force: true });
  await clearContent();
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  await closeDb();
});

describe('runOrphanCleanup with the Database backend', () => {
  beforeEach(async () => {
    await clearContent();
    await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
    await seedDefaultStorageBackend();
  });

  it('reclaims abandoned uploads but preserves referenced and recent assets', async () => {
    const abandoned = await makeAsset({ createdAt: TWO_DAYS_AGO() });
    const recent = await makeAsset({});

    const referenced = await makeAsset({ createdAt: TWO_DAYS_AGO() });
    const [page] = await db
      .insert(schema.pages)
      .values({ spaceId, slug: 's', path: `o/${randomUUID()}`, title: 'T', authorId: userId })
      .returning();
    const [rev] = await db
      .insert(schema.pageRevisions)
      .values({ pageId: page!.id, versionNumber: 1, contentSource: 'x', contentHtml: '<p>x</p>', contentHash: 'h', authorId: userId })
      .returning();
    await db.insert(schema.contentAssetRefs).values({ assetId: referenced, revisionId: rev!.id });

    const result = await runOrphanCleanup();
    expect(result.reclaimedUploads).toBe(1);

    const reclaimed = await db.query.contentAssets.findFirst({ where: eq(schema.contentAssets.id, abandoned) });
    expect(reclaimed!.deletedAt).not.toBeNull();
    const blob = await db.query.contentBlobs.findFirst({ where: eq(schema.contentBlobs.assetId, abandoned) });
    expect(blob).toBeUndefined();

    const keptRecent = await db.query.contentAssets.findFirst({ where: eq(schema.contentAssets.id, recent) });
    expect(keptRecent!.deletedAt).toBeNull();
    const keptRef = await db.query.contentAssets.findFirst({ where: eq(schema.contentAssets.id, referenced) });
    expect(keptRef!.deletedAt).toBeNull();
  });

  it('preserves raw original-byte assets referenced by original_asset_id past the upload TTL', async () => {
    const originalBytes = await makeAsset({ createdAt: TWO_DAYS_AGO() });
    const abandoned = await makeAsset({ createdAt: TWO_DAYS_AGO() });

    const [page] = await db
      .insert(schema.pages)
      .values({ spaceId, slug: 's', path: `o/${randomUUID()}`, title: 'T', authorId: userId })
      .returning();
    await db
      .insert(schema.pageRevisions)
      .values({ pageId: page!.id, versionNumber: 1, contentSource: 'x', contentHtml: '<p>x</p>', contentHash: 'h', authorId: userId, originalAssetId: originalBytes });

    const result = await runOrphanCleanup();
    expect(result.reclaimedUploads).toBe(1);

    const reclaimed = await db.query.contentAssets.findFirst({ where: eq(schema.contentAssets.id, abandoned) });
    expect(reclaimed!.deletedAt).not.toBeNull();

    const kept = await db.query.contentAssets.findFirst({ where: eq(schema.contentAssets.id, originalBytes) });
    expect(kept!.deletedAt).toBeNull();
    const blob = await db.query.contentBlobs.findFirst({ where: eq(schema.contentBlobs.assetId, originalBytes) });
    expect(blob).toBeDefined();
  });
});

describe('runOrphanCleanup with a Local backend', () => {
  beforeEach(async () => {
    await clearContent();
    await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
    await db
      .insert(schema.storageBackends)
      .values({ type: 'local', purpose: 'primary', isActive: true, config: { basePath: baseDir } });
  });

  it('deletes leftover store objects with no live DB row', async () => {
    const store = new LocalStore(baseDir);
    const strayImage = randomUUID();
    const strayMarkdown = randomUUID();
    await store.putImage(strayImage, Buffer.from([9]), 'image/png');
    await store.putMarkdown(strayMarkdown, 'orphan');

    const result = await runOrphanCleanup();
    expect(result.deletedObjects).toBeGreaterThanOrEqual(2);
    expect(existsSync(path.join(baseDir, 'assets', strayImage))).toBe(false);
    expect(existsSync(path.join(baseDir, 'markdown', `${strayMarkdown}.md`))).toBe(false);
  });
});
