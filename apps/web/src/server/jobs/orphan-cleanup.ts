import { eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { getActiveStore } from '@/server/content-store/registry';
import { listAbandonedUploadIds } from '@/server/content-store/atomic-write';
import { logger } from '@/server/logger';

export type OrphanCleanupResult = { reclaimedUploads: number; deletedObjects: number };

/**
 * Bounded, reference-aware orphan cleanup (R10 / plan D3a):
 *  - reclaim abandoned uploads (assets past the upload TTL with no revision
 *    reference): delete their bytes and soft-delete the row;
 *  - delete leftover store objects with no live DB row (failed external-first
 *    write compensation). Referenced and recent assets are preserved.
 */
export async function runOrphanCleanup(now: Date = new Date()): Promise<OrphanCleanupResult> {
  let reclaimedUploads = 0;
  let deletedObjects = 0;
  const store = await getActiveStore();

  // 1. Abandoned uploads: bytes + soft delete.
  const abandoned = await listAbandonedUploadIds(env.CONTENT_UPLOAD_TTL_HOURS, now);
  for (const id of abandoned) {
    await store.deleteImage(id).catch((error) =>
      logger.warn('orphan-cleanup: image delete failed', { id, error: String(error) }),
    );
    await db
      .update(schema.contentAssets)
      .set({ deletedAt: now })
      .where(eq(schema.contentAssets.id, id));
    reclaimedUploads += 1;
  }

  // 2. Leftover image objects with no live asset row (compensated-write debris).
  const liveAssetIds = new Set(
    (
      await db
        .select({ id: schema.contentAssets.id })
        .from(schema.contentAssets)
        .where(isNull(schema.contentAssets.deletedAt))
    ).map((r) => r.id),
  );
  for await (const key of store.listImageKeys()) {
    if (!liveAssetIds.has(key)) {
      await store.deleteImage(key).catch(() => undefined);
      deletedObjects += 1;
    }
  }

  // 3. Leftover markdown objects with no revision row.
  const revisionIds = new Set(
    (await db.select({ id: schema.pageRevisions.id }).from(schema.pageRevisions)).map((r) => r.id),
  );
  for await (const key of store.listMarkdownKeys()) {
    if (!revisionIds.has(key)) {
      await store.deleteMarkdown(key).catch(() => undefined);
      deletedObjects += 1;
    }
  }

  return { reclaimedUploads, deletedObjects };
}
