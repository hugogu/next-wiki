import type { PgBoss } from 'pg-boss';
import { QUEUES } from './runtime';
import { runMigration } from './content-migration';
import { runStorageCleanup } from './storage-cleanup';
import { runOrphanCleanup } from './orphan-cleanup';
import { findInterruptedMigrationIds } from '@/server/services/migration';
import { logger } from '@/server/logger';
import { runStorageReplication } from './storage-replication';
import { inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

type JobBatch = { data: unknown }[];

/**
 * Explicit registration of the storage subsystem's job handlers and queues
 * (constitution P9 — no dynamic discovery). Also performs boot recovery: any
 * migration interrupted mid-flight is re-enqueued, and content-addressed writes
 * make the re-run safe (FR-022).
 */
export async function registerJobs(boss: PgBoss): Promise<void> {
  for (const queue of Object.values(QUEUES)) {
    await boss.createQueue(queue);
  }

  await boss.work(QUEUES.migration, async (jobs: JobBatch) => {
    for (const job of jobs) {
      await runMigration((job.data as { migrationId: string }).migrationId);
    }
  });

  await boss.work(QUEUES.storageCleanup, async (jobs: JobBatch) => {
    for (const job of jobs) {
      await runStorageCleanup((job.data as { jobId: string }).jobId);
    }
  });

  await boss.work(QUEUES.orphanCleanup, async () => {
    await runOrphanCleanup();
  });

  await boss.work(QUEUES.replication, async () => {
    await runStorageReplication();
  });
  await boss.schedule(QUEUES.replication, '* * * * *', {});

  const pendingReplication = await db
    .select({ id: schema.storageReplicationTasks.id })
    .from(schema.storageReplicationTasks)
    .where(inArray(schema.storageReplicationTasks.status, ['pending', 'failed']))
    .limit(1);
  if (pendingReplication.length > 0) await boss.send(QUEUES.replication, {});

  for (const migrationId of await findInterruptedMigrationIds()) {
    await boss.send(QUEUES.migration, { migrationId });
    logger.info('re-enqueued interrupted migration', { migrationId });
  }
}
