import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import { truncateStorageTables } from '../../../test/content-storage-fixtures';
import * as schema from '@/server/db/schema';
import { seedDefaultStorageBackend } from '@/server/seed';
import { runMigration } from './content-migration';

const sha256 = (d: Buffer | string) => createHash('sha256').update(d).digest('hex');

let baseDir: string;
let userId: string;
let spaceId: string;
let dbBackendId: string;
let localBackendId: string;

async function createRevision(source: string): Promise<string> {
  const [page] = await db
    .insert(schema.pages)
    .values({ spaceId, slug: 's', path: `m/${randomUUID()}`, title: 'T', authorId: userId })
    .returning();
  const [rev] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: source,
      contentHtml: '<p></p>',
      contentHash: sha256(source),
      authorId: userId,
    })
    .returning();
  return rev!.id;
}

async function createAsset(bytes: Buffer): Promise<string> {
  const [asset] = await db
    .insert(schema.contentAssets)
    .values({ kind: 'image', contentHash: sha256(bytes), contentType: 'image/png', sizeBytes: bytes.length, createdBy: userId })
    .returning();
  await db.insert(schema.contentBlobs).values({ assetId: asset!.id, bytes });
  return asset!.id;
}

async function newMigration(): Promise<string> {
  const [m] = await db
    .insert(schema.contentMigrations)
    .values({ sourceBackendId: dbBackendId, targetBackendId: localBackendId, status: 'pending', createdBy: userId })
    .returning();
  return m!.id;
}

async function fullReset() {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.storageBackends);
  await seedDefaultStorageBackend();
  const dbB = await db.query.storageBackends.findFirst({ where: eq(schema.storageBackends.type, 'database') });
  dbBackendId = dbB!.id;
  const [local] = await db
    .insert(schema.storageBackends)
    .values({ type: 'local', purpose: 'primary', isActive: false, config: { basePath: baseDir } })
    .returning();
  localBackendId = local!.id;
}

beforeAll(async () => {
  await truncateStorageTables();
  baseDir = mkdtempSync(path.join(tmpdir(), 'nw-migr-job-'));
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  const [space] = await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' }).returning();
  spaceId = space!.id;
  const [user] = await db.insert(schema.users).values({ email: 'mj@example.com', passwordHash: 'H', role: 'admin' }).returning();
  userId = user!.id;
});

afterAll(async () => {
  rmSync(baseDir, { recursive: true, force: true });
  await truncateStorageTables();
  await closeDb();
});

beforeEach(fullReset);

async function activeBackendType(): Promise<string | undefined> {
  const row = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.isActive, true),
  });
  return row?.type;
}

describe('runMigration', () => {
  it('copies, verifies, and cuts over to the target backend', async () => {
    const revId = await createRevision('# Hello\n\ncontent');
    const assetId = await createAsset(Buffer.from([1, 2, 3, 4]));
    const id = await newMigration();

    await runMigration(id);

    const m = await db.query.contentMigrations.findFirst({ where: eq(schema.contentMigrations.id, id) });
    expect(m!.status).toBe('completed');
    expect(m!.totalItems).toBe(2);
    expect(m!.copiedItems).toBe(2);
    expect(m!.verifiedItems).toBe(2);

    expect(existsSync(path.join(baseDir, 'markdown', `${revId}.md`))).toBe(true);
    expect(existsSync(path.join(baseDir, 'assets', assetId))).toBe(true);

    // Cutover flipped the active backend to Local.
    expect(await activeBackendType()).toBe('local');
  });

  it('aborts before cutover when abort is requested, leaving the source active', async () => {
    await createRevision('x');
    const id = await newMigration();
    await db.update(schema.contentMigrations).set({ abortRequested: true }).where(eq(schema.contentMigrations.id, id));

    await runMigration(id);

    const m = await db.query.contentMigrations.findFirst({ where: eq(schema.contentMigrations.id, id) });
    expect(m!.status).toBe('aborted');
    expect(await activeBackendType()).toBe('database');
  });

  it('fails and retains the source on a fingerprint mismatch', async () => {
    const revId = await createRevision('original');
    // Corrupt the stored fingerprint so verification fails.
    await db.update(schema.pageRevisions).set({ contentHash: 'deadbeef' }).where(eq(schema.pageRevisions.id, revId));
    const id = await newMigration();

    await runMigration(id);

    const m = await db.query.contentMigrations.findFirst({ where: eq(schema.contentMigrations.id, id) });
    expect(m!.status).toBe('failed');
    expect(m!.errorMessage).toMatch(/fingerprint mismatch/i);
    expect(await activeBackendType()).toBe('database');
  });

  it('is idempotent: re-running a completed migration is a no-op', async () => {
    await createRevision('y');
    const id = await newMigration();
    await runMigration(id);
    await runMigration(id);
    const m = await db.query.contentMigrations.findFirst({ where: eq(schema.contentMigrations.id, id) });
    expect(m!.status).toBe('completed');
  });
});
