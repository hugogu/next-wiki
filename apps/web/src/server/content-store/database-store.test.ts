import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DatabaseStore } from './database-store';
import { ContentNotFoundError } from './types';
import { runContentStoreConformance } from './content-store.conformance';

let spaceId: string;
let userId: string;

async function ensureSpaceAndUser() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'default', name: 'Default', anonymousRead: true })
    .onConflictDoNothing()
    .returning();
  spaceId =
    space?.id ??
    (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') }))!.id;

  const [user] = await db
    .insert(schema.users)
    .values({ email: `store-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'editor' })
    .returning();
  userId = user!.id;
}

async function makePage(): Promise<string> {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId,
      slug: 'p',
      path: `store/${randomUUID()}`,
      title: 'P',
      authorId: userId,
    })
    .returning();
  return page!.id;
}

async function cleanup() {
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.users);
}

beforeAll(async () => {
  await cleanup();
  await ensureSpaceAndUser();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

const store = new DatabaseStore();

runContentStoreConformance({
  label: 'DatabaseStore',
  store,
  async provisionMarkdownKey() {
    const pageId = await makePage();
    const [rev] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId,
        versionNumber: 1,
        contentSource: 'initial',
        contentHtml: '<p>initial</p>',
        contentHash: 'h',
        authorId: userId,
      })
      .returning();
    return rev!.id;
  },
  async provisionImageKey(contentType: string) {
    const [asset] = await db
      .insert(schema.contentAssets)
      .values({ kind: 'image', contentHash: 'h', contentType, sizeBytes: 0, createdBy: userId })
      .returning();
    return asset!.id;
  },
  unknownKey() {
    return randomUUID();
  },
});

describe('DatabaseStore specifics', () => {
  it('treats a null content_source as a missing markdown key', async () => {
    const pageId = await makePage();
    const [rev] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId,
        versionNumber: 1,
        contentSource: null,
        contentHtml: '<p></p>',
        contentHash: 'h',
        authorId: userId,
      })
      .returning();
    await expect(store.getMarkdown(rev!.id)).rejects.toBeInstanceOf(ContentNotFoundError);
  });
});
