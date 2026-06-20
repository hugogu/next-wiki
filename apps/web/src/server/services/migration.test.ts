import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import { truncateStorageTables } from '../../../test/content-storage-fixtures';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { seedDefaultStorageBackend } from '@/server/seed';
import * as migration from '@/server/services/migration';
import { LocalStore } from '@/server/content-store/local-store';

let adminCtx: PermCtx;
let editorCtx: PermCtx;
let baseDir: string;
let localBackendId: string;
let dbBackendId: string;

async function reset() {
  rmSync(baseDir, { recursive: true, force: true });
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await seedDefaultStorageBackend();
  const dbBackend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.type, 'database'),
  });
  dbBackendId = dbBackend!.id;
  const [local] = await db
    .insert(schema.storageBackends)
    .values({ type: 'local', purpose: 'primary', isActive: false, config: { basePath: baseDir } })
    .returning();
  localBackendId = local!.id;
}

beforeAll(async () => {
  await truncateStorageTables();
  baseDir = mkdtempSync(path.join(tmpdir(), 'nw-migr-svc-'));
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'm-admin@example.com', passwordHash: 'H', role: 'admin' })
    .returning();
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'm-editor@example.com', passwordHash: 'H', role: 'editor' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
  editorCtx = buildUserCtx(editor!.id, 'editor');
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

describe('startMigration', () => {
  it('rejects non-admins', async () => {
    await expect(
      migration.startMigration(editorCtx, { targetBackendId: localBackendId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects migrating to the already-active backend', async () => {
    await expect(
      migration.startMigration(adminCtx, { targetBackendId: dbBackendId }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('creates a pending migration that immediately acts as the write lock', async () => {
    const { id } = await migration.startMigration(adminCtx, { targetBackendId: localBackendId });
    expect(await migration.isMigrationActive()).toBe(true);
    const view = await migration.getMigration(adminCtx, id);
    expect(view?.status).toBe('pending');
  });

  it('enforces single-flight', async () => {
    await migration.startMigration(adminCtx, { targetBackendId: localBackendId });
    await expect(
      migration.startMigration(adminCtx, { targetBackendId: localBackendId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires confirmation when the target already has data', async () => {
    await new LocalStore(baseDir).putMarkdown('11111111-1111-1111-1111-111111111111', 'x');
    await expect(
      migration.startMigration(adminCtx, { targetBackendId: localBackendId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const { id } = await migration.startMigration(adminCtx, {
      targetBackendId: localBackendId,
      confirmOverwrite: true,
    });
    expect(id).toBeTruthy();
  });
});

describe('requestAbort', () => {
  it('sets abort_requested on an active migration and refuses terminal ones', async () => {
    const { id } = await migration.startMigration(adminCtx, { targetBackendId: localBackendId });
    const view = await migration.requestAbort(adminCtx, id);
    expect(view.abortRequested).toBe(true);

    await db
      .update(schema.contentMigrations)
      .set({ status: 'completed' })
      .where(eq(schema.contentMigrations.id, id));
    await expect(migration.requestAbort(adminCtx, id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
