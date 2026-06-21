import type { PgBoss } from 'pg-boss';
import { QUEUES } from './runtime';
import { runMigration } from './content-migration';
import { runStorageCleanup } from './storage-cleanup';
import { runOrphanCleanup } from './orphan-cleanup';
import { findInterruptedMigrationIds } from '@/server/services/migration';
import { logger } from '@/server/logger';
import { runStorageReplication } from './storage-replication';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { runGitExport } from './git-export';
import { tickScheduledGitExport } from '@/server/services/git-export';
import { registerAiActionHandler, runAiAction } from './ai-actions';
import { runAiCleanup } from './ai-cleanup';
import { findRecoverableActionIds } from '@/server/services/ai-actions';
import { runModelSyncAction, runProviderTestAction } from './ai-admin';
import { runIndexRebuildAction } from './ai-index';
import { runSemanticSearchAction } from '@/server/services/ai-retrieval';
import { runWikiQuestionAction } from './ai-question';
import { runTextOptimizationAction } from './ai-optimization';
import { runImageGenerationAction } from './ai-image-generation';

type JobBatch = { data: unknown }[];

/**
 * Explicit registration of the storage subsystem's job handlers and queues
 * (constitution P9 — no dynamic discovery). Also performs boot recovery: any
 * migration interrupted mid-flight is re-enqueued, and content-addressed writes
 * make the re-run safe (FR-022).
 */
export async function registerJobs(boss: PgBoss): Promise<void> {
  registerAiActionHandler('provider_test', runProviderTestAction);
  registerAiActionHandler('model_sync', runModelSyncAction);
  registerAiActionHandler('index_rebuild', runIndexRebuildAction);
  registerAiActionHandler('semantic_search', runSemanticSearchAction);
  registerAiActionHandler('wiki_question', runWikiQuestionAction);
  registerAiActionHandler('text_optimization', runTextOptimizationAction);
  registerAiActionHandler('image_generation', runImageGenerationAction);
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
  await boss.work(QUEUES.gitExport, async (jobs: JobBatch) => {
    const items = jobs.map((job) => job.data as { backendId?: string; scheduled?: boolean });
    // A full-snapshot export reconciles everything, so a real trigger in the
    // batch supersedes the scheduled tick; only pure-scheduled batches tick.
    const backendId = items.filter((item) => item?.backendId).at(-1)?.backendId;
    if (backendId) {
      await runGitExport(backendId);
    } else if (items.some((item) => item?.scheduled)) {
      await tickScheduledGitExport();
    }
  });
  await boss.work(QUEUES.aiAction, async (jobs: JobBatch) => {
    for (const job of jobs) {
      await runAiAction((job.data as { actionId: string }).actionId);
    }
  });
  await boss.work(QUEUES.aiCleanup, async () => {
    await runAiCleanup();
  });
  await boss.schedule(QUEUES.replication, '* * * * *', {});
  await boss.schedule(QUEUES.gitExport, '* * * * *', { scheduled: true });
  await boss.schedule(QUEUES.aiCleanup, '*/15 * * * *', {});

  const pendingReplication = await db
    .select({ id: schema.storageReplicationTasks.id })
    .from(schema.storageReplicationTasks)
    .where(inArray(schema.storageReplicationTasks.status, ['pending', 'failed']))
    .limit(1);
  if (pendingReplication.length > 0) await boss.send(QUEUES.replication, {});

  const enabledGitExport = await db.query.storageBackends.findFirst({
    where: and(
      eq(schema.storageBackends.purpose, 'git_export'),
      inArray(schema.storageBackends.replicaState, ['backfilling', 'degraded']),
    ),
  });
  if (enabledGitExport?.isActive) {
    await boss.send(QUEUES.gitExport, { backendId: enabledGitExport.id });
  }

  for (const migrationId of await findInterruptedMigrationIds()) {
    await boss.send(QUEUES.migration, { migrationId });
    logger.info('re-enqueued interrupted migration', { migrationId });
  }
  for (const actionId of await findRecoverableActionIds()) {
    await boss.send(QUEUES.aiAction, { actionId });
    logger.info('re-enqueued interrupted AI action', { actionId });
  }
}
