import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DatabaseStore } from '@/server/content-store/database-store';
import { getStoreFor } from '@/server/content-store/registry';
import { logger } from '@/server/logger';

const BATCH_SIZE = 50;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function runStorageReplication(): Promise<void> {
  for (;;) {
    const tasks = await db
      .select()
      .from(schema.storageReplicationTasks)
      .where(
        and(
          inArray(schema.storageReplicationTasks.status, ['pending', 'failed']),
          lte(schema.storageReplicationTasks.availableAt, new Date()),
        ),
      )
      .orderBy(asc(schema.storageReplicationTasks.createdAt))
      .limit(BATCH_SIZE);
    for (const task of tasks) await deliver(task.id);
    if (tasks.length < BATCH_SIZE) return;
  }
}

async function deliver(taskId: string): Promise<void> {
  const task = await db.query.storageReplicationTasks.findFirst({
    where: eq(schema.storageReplicationTasks.id, taskId),
  });
  if (!task) return;
  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, task.backendId),
  });
  if (
    !backend ||
    backend.type === 'database' ||
    ['disabled', 'deleting'].includes(backend.replicaState)
  ) {
    await db
      .update(schema.storageReplicationTasks)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.storageReplicationTasks.id, task.id));
    return;
  }

  await db
    .update(schema.storageReplicationTasks)
    .set({ status: 'running', attempts: task.attempts + 1, updatedAt: new Date() })
    .where(eq(schema.storageReplicationTasks.id, task.id));

  try {
    const target = getStoreFor(backend);
    const source = new DatabaseStore();
    if (task.operation === 'delete') {
      if (task.objectKind === 'markdown') await target.deleteMarkdown(task.objectId);
      else await target.deleteImage(task.objectId);
    } else if (task.objectKind === 'markdown') {
      const markdown = await source.getMarkdown(task.objectId);
      if (task.expectedHash && sha256(markdown) !== task.expectedHash) {
        throw new Error('Authoritative Markdown hash changed before replication');
      }
      await target.putMarkdown(task.objectId, markdown);
      if (task.expectedHash && sha256(await target.getMarkdown(task.objectId)) !== task.expectedHash) {
        throw new Error('Replica Markdown verification failed');
      }
    } else {
      const image = await source.getImage(task.objectId);
      if (task.expectedHash && sha256(image.bytes) !== task.expectedHash) {
        throw new Error('Authoritative image hash changed before replication');
      }
      await target.putImage(task.objectId, image.bytes, image.contentType);
      if (task.expectedHash && sha256((await target.getImage(task.objectId)).bytes) !== task.expectedHash) {
        throw new Error('Replica image verification failed');
      }
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.storageReplicationTasks)
        .set({ status: 'completed', completedAt: now, lastError: null, updatedAt: now })
        .where(eq(schema.storageReplicationTasks.id, task.id));
      await tx
        .update(schema.storageBackends)
        .set({ lastSyncAt: now, lastError: null, updatedAt: now })
        .where(eq(schema.storageBackends.id, backend.id));

      const outstanding = await tx
        .select({ id: schema.storageReplicationTasks.id })
        .from(schema.storageReplicationTasks)
        .where(
          and(
            eq(schema.storageReplicationTasks.backendId, backend.id),
            inArray(schema.storageReplicationTasks.status, ['pending', 'running', 'failed']),
          ),
        )
        .limit(1);
      if (
        ['backfilling', 'degraded'].includes(backend.replicaState) &&
        outstanding.length === 0
      ) {
        await tx
          .update(schema.storageBackends)
          .set({ replicaState: 'enabled', syncCompletedAt: now, updatedAt: now })
          .where(eq(schema.storageBackends.id, backend.id));
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = task.attempts + 1;
    const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
    await db.transaction(async (tx) => {
      await tx
        .update(schema.storageReplicationTasks)
        .set({
          status: 'failed',
          attempts,
          availableAt: new Date(Date.now() + delayMs),
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(schema.storageReplicationTasks.id, task.id));
      await tx
        .update(schema.storageBackends)
        .set({ replicaState: 'degraded', lastError: message, updatedAt: new Date() })
        .where(eq(schema.storageBackends.id, backend.id));
    });
    logger.error('storage replication failed', { taskId, backendId: backend.id, error: message });
  }
}
