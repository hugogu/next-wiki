import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { seedDefaultStorageBackend } from '@/server/seed';

let userId: string;

async function cleanup() {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.storageBackends);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
}

beforeAll(async () => {
  await cleanup();
  await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' });
  const [user] = await db
    .insert(schema.users)
    .values({ email: 'schema@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  userId = user!.id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

beforeEach(async () => {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
});

describe('storage_backends', () => {
  it('seeds exactly one active Database primary, idempotently', async () => {
    await seedDefaultStorageBackend();
    await seedDefaultStorageBackend();

    const rows = await db
      .select()
      .from(schema.storageBackends)
      .where(eq(schema.storageBackends.purpose, 'primary'));
    expect(rows.length).toBe(1);
    expect(rows[0]!.type).toBe('database');
    expect(rows[0]!.isActive).toBe(true);
  });

  it('allows multiple enabled replicas while Database remains authoritative', async () => {
    await seedDefaultStorageBackend();
    await db.insert(schema.storageBackends).values({
      type: 'local',
      purpose: 'primary',
      replicaState: 'enabled',
      config: { basePath: '/data' },
    });
    const rows = await db
      .select()
      .from(schema.storageBackends)
      .where(eq(schema.storageBackends.replicaState, 'enabled'));
    expect(rows.map((row) => row.type).sort()).toEqual(['database', 'local']);
  });

  it('permits a configured-but-inactive secondary primary', async () => {
    await seedDefaultStorageBackend();
    await db
      .insert(schema.storageBackends)
      .values({ type: 'local', purpose: 'primary', isActive: false, config: { basePath: '/data' } });

    const inactive = await db.query.storageBackends.findFirst({
      where: and(
        eq(schema.storageBackends.type, 'local'),
        eq(schema.storageBackends.isActive, false),
      ),
    });
    expect(inactive).toBeTruthy();
  });

  it('treats a git_export backend independently of the active primary', async () => {
    await seedDefaultStorageBackend();
    await db.insert(schema.storageBackends).values({
      type: 'git',
      purpose: 'git_export',
      isActive: true,
      config: { remoteUrl: 'https://example.com/repo.git', branch: 'main' },
    });
    const git = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.purpose, 'git_export'),
    });
    expect(git?.isActive).toBe(true);
  });
});

describe('page_revisions.content_source', () => {
  it('remains nullable only for compatibility with legacy external-only revisions', async () => {
    const space = await db.query.spaces.findFirst();
    const [page] = await db
      .insert(schema.pages)
      .values({ spaceId: space!.id, slug: 's', path: `n/${randomUUID()}`, title: 'T', authorId: userId })
      .returning();
    const [rev] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId: page!.id,
        versionNumber: 1,
        contentSource: null,
        contentHtml: '<p></p>',
        contentHash: 'h',
        authorId: userId,
      })
      .returning();
    expect(rev!.contentSource).toBeNull();
  });
});

describe('content_migrations', () => {
  it('defaults a new migration to pending with zeroed counters', async () => {
    const [db1] = await db
      .insert(schema.storageBackends)
      .values({ type: 'database', purpose: 'primary', isActive: true, config: {} })
      .returning();
    const [target] = await db
      .insert(schema.storageBackends)
      .values({ type: 'local', purpose: 'primary', isActive: false, config: { basePath: '/d' } })
      .returning();

    const [migration] = await db
      .insert(schema.contentMigrations)
      .values({ sourceBackendId: db1!.id, targetBackendId: target!.id, createdBy: userId })
      .returning();

    expect(migration!.status).toBe('pending');
    expect(migration!.copiedItems).toBe(0);
    expect(migration!.abortRequested).toBe(false);
  });
});
