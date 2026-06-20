import { beforeAll, afterAll, describe, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { S3Store } from './s3-store';
import { runContentStoreConformance } from './content-store.conformance';

/**
 * S3 conformance runs against a MinIO container in the integration profile. It is
 * skipped unless the MinIO connection env is provided, so CI without object
 * storage stays green (LocalStore + DatabaseStore cover the contract there).
 *
 * To run: start MinIO (see docker-compose `storage-s3` profile) and set
 * S3_TEST_ENDPOINT, S3_TEST_BUCKET, S3_TEST_ACCESS_KEY, S3_TEST_SECRET_KEY.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const bucket = process.env.S3_TEST_BUCKET;
const accessKeyId = process.env.S3_TEST_ACCESS_KEY;
const secretAccessKey = process.env.S3_TEST_SECRET_KEY;
const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);

if (!configured) {
  describe.skip('S3Store conformance (MinIO not configured)', () => {
    it('skipped', () => undefined);
  });
} else {
  let userId: string;
  const store = new S3Store({
    endpoint,
    region: process.env.S3_TEST_REGION ?? 'us-east-1',
    bucket: bucket!,
    prefix: `test-${randomUUID()}`,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  });

  beforeAll(async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `s3-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'editor' })
      .returning();
    userId = user!.id;
  });

  afterAll(async () => {
    await db.delete(schema.contentAssets);
    await db.delete(schema.users);
    await closeDb();
  });

  runContentStoreConformance({
    label: 'S3Store (MinIO)',
    store,
    async provisionMarkdownKey() {
      return randomUUID();
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
}
