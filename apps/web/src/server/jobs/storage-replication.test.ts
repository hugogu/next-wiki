import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { seedDefaultStorageBackend } from '@/server/seed';
import { addBackendBackfillTasks } from '@/server/services/storage-replication';
import { runStorageReplication } from './storage-replication';
import { LocalStore } from '@/server/content-store/local-store';
import { withTempDir } from '../../../test/content-storage-fixtures';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
let userId: string;
let spaceId: string;

beforeAll(async () => {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: `replication-${randomUUID()}`, name: 'Replication' })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({ email: `replication-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'admin' })
    .returning();
  spaceId = space!.id;
  userId = user!.id;
});

beforeEach(async () => {
  await db.delete(schema.storageReplicationTasks);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.storageBackends);
  await seedDefaultStorageBackend();
});

afterAll(async () => {
  await db.delete(schema.storageReplicationTasks);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
  await closeDb();
});

describe('storage replication worker', () => {
  it('backfills and verifies Database Markdown and image bytes into Local storage', async () => {
    const temp = await withTempDir();
    try {
      const [backend] = await db
        .insert(schema.storageBackends)
        .values({
          type: 'local',
          purpose: 'primary',
          replicaState: 'backfilling',
          config: { basePath: temp.dir },
        })
        .returning();
      const [page] = await db
        .insert(schema.pages)
        .values({
          spaceId,
          slug: 'replicated',
          path: `replicated/${randomUUID()}`,
          title: 'Replicated',
          authorId: userId,
        })
        .returning();
      const markdown = '# Replicated';
      const [revision] = await db
        .insert(schema.pageRevisions)
        .values({
          pageId: page!.id,
          versionNumber: 1,
          contentSource: markdown,
          contentHtml: '<h1>Replicated</h1>',
          contentHash: hash(markdown),
          authorId: userId,
        })
        .returning();
      const bytes = Buffer.from([1, 2, 3, 4]);
      const [asset] = await db
        .insert(schema.contentAssets)
        .values({
          contentHash: hash(bytes),
          contentType: 'image/png',
          sizeBytes: bytes.length,
          createdBy: userId,
        })
        .returning();
      await db.insert(schema.contentBlobs).values({ assetId: asset!.id, bytes });
      await addBackendBackfillTasks(db, backend!.id);

      await runStorageReplication();

      const local = new LocalStore(temp.dir);
      expect(await local.getMarkdown(revision!.id)).toBe(markdown);
      expect((await local.getImage(asset!.id)).bytes).toEqual(bytes);
      const refreshed = await db.query.storageBackends.findFirst({
        where: eq(schema.storageBackends.id, backend!.id),
      });
      expect(refreshed?.replicaState).toBe('enabled');
    } finally {
      await temp.cleanup();
    }
  });
});
