import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getStoreFor } from '@/server/content-store/registry';
import { logger } from '@/server/logger';

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const k of iter) out.push(k);
  return out;
}

/**
 * Delete all retained content from a confirmed, inactive backend (FR-021).
 * Refuses the active backend defensively, reports progress, and records partial
 * failures rather than throwing.
 */
export async function runStorageCleanup(jobId: string): Promise<void> {
  const job = await db.query.storageCleanupJobs.findFirst({
    where: eq(schema.storageCleanupJobs.id, jobId),
  });
  if (!job || !['pending', 'running'].includes(job.status)) return;

  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, job.backendId),
  });
  if (!backend) return fail(jobId, 'Backend no longer exists');
  if (backend.isActive) return fail(jobId, 'Refusing to clean up the active backend');

  const store = getStoreFor(backend);

  try {
    await db
      .update(schema.storageCleanupJobs)
      .set({ status: 'running', startedAt: job.startedAt ?? new Date() })
      .where(eq(schema.storageCleanupJobs.id, jobId));
    const mdKeys = await collect(store.listMarkdownKeys());
    const imgKeys = await collect(store.listImageKeys());
    await db
      .update(schema.storageCleanupJobs)
      .set({ totalItems: mdKeys.length + imgKeys.length })
      .where(eq(schema.storageCleanupJobs.id, jobId));

    let deleted = 0;
    let firstError: string | null = null;

    const removeAll = async (keys: string[], remove: (k: string) => Promise<void>) => {
      for (const key of keys) {
        try {
          await remove(key);
          deleted += 1;
          await db
            .update(schema.storageCleanupJobs)
            .set({ deletedItems: deleted })
            .where(eq(schema.storageCleanupJobs.id, jobId));
        } catch (error) {
          firstError ??= error instanceof Error ? error.message : String(error);
        }
      }
    };

    await removeAll(mdKeys, (k) => store.deleteMarkdown(k));
    await removeAll(imgKeys, (k) => store.deleteImage(k));

    if (firstError) return fail(jobId, firstError);
    await db
      .update(schema.storageCleanupJobs)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(eq(schema.storageCleanupJobs.id, jobId));
    await db
      .update(schema.storageBackends)
      .set({
        replicaState: 'disabled',
        syncStartedAt: null,
        syncCompletedAt: null,
        lastSyncAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.storageBackends.id, backend.id));
  } catch (error) {
    await fail(jobId, error instanceof Error ? error.message : String(error));
  }
}

async function fail(jobId: string, message: string): Promise<void> {
  logger.error('storage-cleanup failed', { jobId, error: message });
  await db
    .update(schema.storageCleanupJobs)
    .set({ status: 'failed', errorMessage: message, finishedAt: new Date() })
    .where(eq(schema.storageCleanupJobs.id, jobId));
  const job = await db.query.storageCleanupJobs.findFirst({
    where: eq(schema.storageCleanupJobs.id, jobId),
  });
  if (job) {
    const backend = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, job.backendId),
    });
    if (backend?.replicaState !== 'deleting') return;
    await db
      .update(schema.storageBackends)
      .set({ replicaState: 'degraded', lastError: message, updatedAt: new Date() })
      .where(eq(schema.storageBackends.id, job.backendId));
  }
}
