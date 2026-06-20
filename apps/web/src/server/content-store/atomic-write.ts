import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lt, notExists, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DatabaseStore } from './database-store';
import type { ContentStore } from './types';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';

export type NewImageAsset = {
  bytes: Buffer;
  contentType: string;
  contentHash: string;
  sizeBytes: number;
  createdBy: string | null;
};

/**
 * Persist an uploaded image's bytes and `content_assets` metadata atomically.
 *
 * - **Database backend**: bytes (`content_blobs`) and metadata (`content_assets`)
 *   are written in one transaction (plan D3a).
 * - **External backend (Local/S3)**: external-first — generate the id, write and
 *   confirm the object, then commit the DB row. If the DB commit fails, the
 *   object is best-effort deleted; an unsuccessful compensation leaves only an
 *   unreferenced object that bounded orphan cleanup reclaims.
 */
export async function writeImageAsset(
  store: ContentStore,
  asset: NewImageAsset,
): Promise<{ id: string }> {
  if (store instanceof DatabaseStore) {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.contentAssets)
        .values({
          kind: 'image',
          contentHash: asset.contentHash,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
          createdBy: asset.createdBy,
        })
        .returning({ id: schema.contentAssets.id });
      if (!row) throw new Error('Failed to insert content asset');
      await new DatabaseStore(tx).putImage(row.id, asset.bytes);
      await addReplicationTasks(tx, 'image', row.id, asset.contentHash);
      return { id: row.id };
    });
    await kickReplication();
    return created;
  }

  // External-first protocol.
  const id = randomUUID();
  await store.putImage(id, asset.bytes, asset.contentType);
  try {
    await db.insert(schema.contentAssets).values({
      id,
      kind: 'image',
      contentHash: asset.contentHash,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      createdBy: asset.createdBy,
    });
  } catch (error) {
    // Best-effort compensation: remove the now-orphaned external object.
    await store.deleteImage(id).catch(() => undefined);
    throw error;
  }
  return { id };
}

/** True if an asset created at `createdAt` is past the abandoned-upload TTL. */
export function isUploadExpired(createdAt: Date, ttlHours: number, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > ttlHours * 60 * 60 * 1000;
}

/**
 * Ids of abandoned uploads: live assets that no revision references and whose
 * upload TTL has elapsed. These are reclaimed by orphan cleanup (US3); the
 * grace period is the same TTL that bounds the uploader's temporary read access.
 */
export async function listAbandonedUploadIds(
  ttlHours: number,
  now: Date = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ttlHours * 60 * 60 * 1000);
  const rows = await db
    .select({ id: schema.contentAssets.id })
    .from(schema.contentAssets)
    .where(
      and(
        isNull(schema.contentAssets.deletedAt),
        lt(schema.contentAssets.createdAt, cutoff),
        notExists(
          db
            .select({ one: sql`1` })
            .from(schema.contentAssetRefs)
            .where(eq(schema.contentAssetRefs.assetId, schema.contentAssets.id)),
        ),
      ),
    );
  return rows.map((r) => r.id);
}
