import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  writeImageAsset,
  listAbandonedUploadIds,
  isUploadExpired,
} from './atomic-write';
import type { ContentStore, StorageBackendType } from './types';

/** In-memory store standing in for an external backend (Local/S3). */
class FakeExternalStore implements ContentStore {
  readonly type: StorageBackendType = 's3';
  images = new Map<string, Buffer>();
  putCount = 0;
  deleted: string[] = [];

  async putMarkdown(): Promise<void> {}
  async getMarkdown(): Promise<string> {
    return '';
  }
  async deleteMarkdown(): Promise<void> {}
  async putImage(assetId: string, bytes: Buffer): Promise<void> {
    this.putCount += 1;
    this.images.set(assetId, bytes);
  }
  async getImage(assetId: string): Promise<{ bytes: Buffer; contentType: string }> {
    return { bytes: this.images.get(assetId)!, contentType: 'image/png' };
  }
  async deleteImage(assetId: string): Promise<void> {
    this.deleted.push(assetId);
    this.images.delete(assetId);
  }
  async *listMarkdownKeys(): AsyncIterable<string> {}
  async *listImageKeys(): AsyncIterable<string> {
    for (const k of this.images.keys()) yield k;
  }
  async healthCheck() {
    return { ok: true };
  }
}

let userId: string;

async function cleanup() {
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentAssets);
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
    .values({ email: 'atomic@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  userId = user!.id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

const newAsset = (createdBy: string | null) => ({
  bytes: Buffer.from([1, 2, 3]),
  contentType: 'image/png',
  contentHash: 'hash',
  sizeBytes: 3,
  createdBy,
});

describe('writeImageAsset (external-first)', () => {
  it('writes the object first, then commits the metadata row', async () => {
    const store = new FakeExternalStore();
    const { id } = await writeImageAsset(store, newAsset(userId));

    expect(store.putCount).toBe(1);
    expect(store.images.has(id)).toBe(true);
    const row = await db.query.contentAssets.findFirst({
      where: eq(schema.contentAssets.id, id),
    });
    expect(row).toBeTruthy();
  });

  it('compensates by deleting the object when the metadata commit fails', async () => {
    await db.delete(schema.contentBlobs);
    await db.delete(schema.contentAssets);
    const store = new FakeExternalStore();
    // A non-existent createdBy violates the users FK, forcing the DB commit to fail.
    await expect(writeImageAsset(store, newAsset(randomUUID()))).rejects.toBeTruthy();

    expect(store.putCount).toBe(1);
    expect(store.deleted.length).toBe(1);
    // No dangling metadata row was created.
    const count = await db.select().from(schema.contentAssets);
    expect(count.length).toBe(0);
  });
});

describe('orphan detection', () => {
  beforeEach(async () => {
    await db.delete(schema.contentAssetRefs);
    await db.delete(schema.contentAssets);
    await db.delete(schema.pageRevisions);
    await db.delete(schema.pages);
  });

  it('isUploadExpired respects the TTL window', () => {
    const now = new Date('2026-06-20T12:00:00Z');
    expect(isUploadExpired(new Date('2026-06-20T11:00:00Z'), 24, now)).toBe(false);
    expect(isUploadExpired(new Date('2026-06-18T11:00:00Z'), 24, now)).toBe(true);
  });

  it('lists abandoned uploads but spares referenced and recent assets', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const [abandoned] = await db
      .insert(schema.contentAssets)
      .values({ kind: 'image', contentHash: 'h', contentType: 'image/png', sizeBytes: 1, createdBy: userId, createdAt: old })
      .returning();
    const [recent] = await db
      .insert(schema.contentAssets)
      .values({ kind: 'image', contentHash: 'h', contentType: 'image/png', sizeBytes: 1, createdBy: userId })
      .returning();
    const [referenced] = await db
      .insert(schema.contentAssets)
      .values({ kind: 'image', contentHash: 'h', contentType: 'image/png', sizeBytes: 1, createdBy: userId, createdAt: old })
      .returning();

    const space = await db.query.spaces.findFirst();
    const [page] = await db
      .insert(schema.pages)
      .values({ spaceId: space!.id, slug: 's', path: `o/${randomUUID()}`, title: 'T', authorId: userId })
      .returning();
    const [rev] = await db
      .insert(schema.pageRevisions)
      .values({ pageId: page!.id, versionNumber: 1, contentSource: 'x', contentHtml: '<p>x</p>', contentHash: 'h', authorId: userId })
      .returning();
    await db.insert(schema.contentAssetRefs).values({ assetId: referenced!.id, revisionId: rev!.id });

    const ids = await listAbandonedUploadIds(24, now);
    expect(ids).toContain(abandoned!.id);
    expect(ids).not.toContain(recent!.id);
    expect(ids).not.toContain(referenced!.id);
  });
});
