import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { seedDefaultStorageBackend } from '@/server/seed';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import * as contentAssets from '@/server/services/content-assets';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let editorCtx: PermCtx;
let pagePath: string;

async function setupActiveMigration() {
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await seedDefaultStorageBackend();
  const dbB = await db.query.storageBackends.findFirst({ where: eq(schema.storageBackends.type, 'database') });
  const [local] = await db
    .insert(schema.storageBackends)
    .values({ type: 'local', purpose: 'primary', isActive: false, config: { basePath: '/tmp/ro' } })
    .returning();
  const editor = await db.query.users.findFirst({ where: eq(schema.users.role, 'editor') });
  await db.insert(schema.contentMigrations).values({
    sourceBackendId: dbB!.id,
    targetBackendId: local!.id,
    status: 'pending',
    createdBy: editor!.id,
  });
}

beforeAll(async () => {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  const [space] = await db.insert(schema.spaces).values({ slug: 'default', name: 'Default', anonymousRead: true }).returning();
  const [editor] = await db.insert(schema.users).values({ email: 'ro@example.com', passwordHash: 'H', role: 'editor' }).returning();
  editorCtx = buildUserCtx(editor!.id, 'editor');

  // A published page exists before the migration starts.
  pagePath = `ro/${randomUUID()}`;
  const { versionId } = await pageService.create(editorCtx, { path: pagePath, title: 'RO', contentSource: '# RO' });
  await db
    .update(schema.pages)
    .set({ currentPublishedVersionId: versionId })
    .where(eq(schema.pages.spaceId, space!.id));
  await db.update(schema.pageRevisions).set({ status: 'published', publishedAt: new Date() }).where(eq(schema.pageRevisions.id, versionId));
});

afterAll(async () => {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.storageCleanupJobs);
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  await closeDb();
});

beforeEach(setupActiveMigration);

describe('write lock while migrating', () => {
  it('blocks page create with STORAGE_MIGRATING', async () => {
    await expect(
      pageService.create(editorCtx, { path: `x/${randomUUID()}`, title: 'X', contentSource: 'x' }),
    ).rejects.toMatchObject({ code: 'STORAGE_MIGRATING' });
  });

  it('blocks new drafts', async () => {
    await expect(
      pageService.newDraft(editorCtx, pagePath, { title: 'RO', contentSource: 'edited' }),
    ).rejects.toMatchObject({ code: 'STORAGE_MIGRATING' });
  });

  it('blocks publish', async () => {
    await expect(
      revisionService.publish(editorCtx, { path: pagePath, version: 1 }),
    ).rejects.toMatchObject({ code: 'STORAGE_MIGRATING' });
  });

  it('blocks image upload', async () => {
    await expect(contentAssets.uploadImage(editorCtx, PNG)).rejects.toMatchObject({
      code: 'STORAGE_MIGRATING',
    });
  });

  it('still allows reads', async () => {
    const live = await pageService.getLive(editorCtx, pagePath);
    expect(live?.path).toBe(pagePath);
  });
});
