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
import { runStorageCleanup } from './storage-cleanup';

let baseDir: string;
let userId: string;
let localBackendId: string;

async function reset() {
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await seedDefaultStorageBackend();
  const [local] = await db
    .insert(schema.storageBackends)
    .values({ type: 'local', purpose: 'primary', isActive: false, config: { basePath: baseDir } })
    .returning();
  localBackendId = local!.id;
}

async function newCleanupJob(backendId: string): Promise<string> {
  const [job] = await db
    .insert(schema.storageCleanupJobs)
    .values({ backendId, status: 'pending', createdBy: userId })
    .returning();
  return job!.id;
}

beforeAll(async () => {
  await truncateStorageTables();
  baseDir = mkdtempSync(path.join(tmpdir(), 'nw-cleanup-'));
  await db.delete(schema.users);
  const [user] = await db.insert(schema.users).values({ email: 'cl@example.com', passwordHash: 'H', role: 'admin' }).returning();
  userId = user!.id;
});

afterAll(async () => {
  rmSync(baseDir, { recursive: true, force: true });
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  await closeDb();
});

beforeEach(reset);

describe('runStorageCleanup', () => {
  it('deletes all retained content from an inactive backend', async () => {
    const store = new LocalStore(baseDir);
    const revId = randomUUID();
    const assetId = randomUUID();
    await store.putMarkdown(revId, 'bye');
    await store.putImage(assetId, Buffer.from([1, 2, 3]), 'image/png');

    const jobId = await newCleanupJob(localBackendId);
    await runStorageCleanup(jobId);

    const job = await db.query.storageCleanupJobs.findFirst({ where: eq(schema.storageCleanupJobs.id, jobId) });
    expect(job!.status).toBe('completed');
    expect(job!.totalItems).toBe(2);
    expect(job!.deletedItems).toBe(2);
    expect(existsSync(path.join(baseDir, 'markdown', `${revId}.md`))).toBe(false);
    expect(existsSync(path.join(baseDir, 'assets', assetId))).toBe(false);
  });

  it('refuses to clean up the active backend', async () => {
    const activeDb = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.type, 'database'),
    });
    const jobId = await newCleanupJob(activeDb!.id);
    await runStorageCleanup(jobId);

    const job = await db.query.storageCleanupJobs.findFirst({ where: eq(schema.storageCleanupJobs.id, jobId) });
    expect(job!.status).toBe('failed');
    expect(job!.errorMessage).toMatch(/active backend/i);
  });
});
