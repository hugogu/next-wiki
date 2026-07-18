import type { JobWithMetadata, PgBoss } from 'pg-boss';
import { QUEUES, QUEUE_EXPIRE_SECONDS } from './runtime';
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
import { findRecoverableActionIds, queueForFeature } from '@/server/services/ai-actions';
import { runModelSyncAction, runProviderTestAction } from './ai-admin';
import { runIndexRebuildAction } from './ai-index';
import { runSemanticSearchAction } from '@/server/services/ai-retrieval';
import { runWikiQuestionAction } from './ai-question';
import { runTextOptimizationAction } from './ai-optimization';
import { runImageGenerationAction } from './ai-image-generation';
import { runTransferExport } from './transfer-export';
import { runTransferPreview } from './transfer-preview';
import { runTransferImport } from './transfer-import';
import { runTransferSourceTest } from './transfer-source-test';
import { runTransferCleanup } from './transfer-cleanup';
import { findRecoverableTransferRunIds } from '@/server/services/transfers';
import { runTagMutation } from './tag-mutations';
import { runPageMetadataBackfill } from './page-metadata-backfill';
import { runTranslationRun } from './translation';
import { findRecoverableTranslationRunIds } from '@/server/services/translations';
import { runPublicPageWarmup } from './public-page-warmup';
import { runFeishuDeliveries, recoverStaleFeishuDeliveries } from './feishu-deliveries';
import { runFeishuCleanup } from './feishu-cleanup';
import {
  clearWritingModeSwitchAfterTerminalFailure,
  recoverWritingModeSwitch,
  runWritingModeSwitch,
  type WritingModeSwitchJobData,
} from './writing-mode-switch';

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
    const expireSeconds = QUEUE_EXPIRE_SECONDS[queue];
    // createQueue is idempotent (ON CONFLICT DO NOTHING), so it won't alter an
    // existing queue's config — re-assert the expiry each boot to push long-
    // running queues past the 15-min default and prevent worker-stall cascades.
    if (expireSeconds) await boss.updateQueue(queue, { expireInSeconds: expireSeconds });
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
  // Dedicated worker so bulk index rebuilds run independently of interactive
  // AI actions on QUEUES.aiAction.
  await boss.work(QUEUES.aiIndex, async (jobs: JobBatch) => {
    for (const job of jobs) {
      await runAiAction((job.data as { actionId: string }).actionId);
    }
  });
  await boss.work(QUEUES.aiCleanup, async () => {
    await runAiCleanup();
  });
  await boss.work(QUEUES.transferExport, async (jobs: JobBatch) => {
    for (const job of jobs) await runTransferExport((job.data as { runId: string }).runId);
  });
  await boss.work(QUEUES.transferPreview, async (jobs: JobBatch) => {
    for (const job of jobs) await runTransferPreview((job.data as { runId: string }).runId);
  });
  await boss.work(QUEUES.transferImport, async (jobs: JobBatch) => {
    for (const job of jobs) await runTransferImport((job.data as { runId: string }).runId);
  });
  await boss.work(QUEUES.transferSourceTest, async (jobs: JobBatch) => {
    for (const job of jobs) await runTransferSourceTest((job.data as { runId: string }).runId);
  });
  await boss.work(QUEUES.transferCleanup, async () => {
    await runTransferCleanup();
  });
  await boss.work(QUEUES.tagMutation, async (jobs: JobBatch) => {
    for (const job of jobs) await runTagMutation((job.data as { mutationId: string }).mutationId);
  });
  await boss.work(QUEUES.publicPageWarmup, async (jobs: JobBatch) => {
    for (const job of jobs) await runPublicPageWarmup((job.data as { href: string }).href);
  });
  // Dedicated worker so a bulk one-language translation run cannot starve
  // interactive AI actions on QUEUES.aiAction.
  await boss.work(QUEUES.translation, async (jobs: JobBatch) => {
    for (const job of jobs) await runTranslationRun((job.data as { runId: string }).runId);
  });
  // Optional Feishu integration (019). The delivery worker ticks every minute to
  // pick up due outbound messages; cleanup runs hourly. Both no-op quickly when
  // the integration is unconfigured, so they add no load to a default deployment.
  await boss.work(QUEUES.feishuDelivery, async () => {
    await runFeishuDeliveries();
  });
  await boss.work(QUEUES.feishuCleanup, async () => {
    await runFeishuCleanup();
  });
  await boss.work<WritingModeSwitchJobData>(
    QUEUES.writingModeSwitch,
    { includeMetadata: true },
    async (jobs: JobWithMetadata<WritingModeSwitchJobData>[]) => {
      const job = jobs[0];
      if (!job) return undefined;
      try {
        return await runWritingModeSwitch(job.id, job.data);
      } catch (error) {
        // pg-boss invokes this handler once per retry. Clearing only on the
        // final attempt leaves the write barrier in place while retries can
        // still complete atomically.
        if (job.retryCount >= job.retryLimit) {
          await clearWritingModeSwitchAfterTerminalFailure(job.id);
        }
        throw error;
      }
    },
  );
  await boss.schedule(QUEUES.replication, '* * * * *', {});
  await boss.schedule(QUEUES.gitExport, '* * * * *', { scheduled: true });
  await boss.schedule(QUEUES.aiCleanup, '*/15 * * * *', {});
  await boss.schedule(QUEUES.transferCleanup, '15 * * * *', {});
  await boss.schedule(QUEUES.feishuDelivery, '* * * * *', {});
  await boss.schedule(QUEUES.feishuCleanup, '30 * * * *', {});

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
  for (const { id: actionId, feature } of await findRecoverableActionIds()) {
    await boss.send(queueForFeature(feature), { actionId });
    logger.info('re-enqueued interrupted AI action', { actionId });
  }
  for (const runId of await findRecoverableTransferRunIds()) {
    const run = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, runId),
    });
    if (!run) continue;
    const queue =
      run.kind === 'site_export'
        ? QUEUES.transferExport
        : run.kind === 'archive_preview' || run.kind === 'wikijs_preview'
          ? QUEUES.transferPreview
          : run.kind === 'wikijs_source_test'
            ? QUEUES.transferSourceTest
            : QUEUES.transferImport;
    await boss.send(queue, { runId });
    logger.info('re-enqueued interrupted transfer run', { runId, kind: run.kind });
  }
  for (const runId of await findRecoverableTranslationRunIds()) {
    await boss.send(QUEUES.translation, { runId });
    logger.info('re-enqueued interrupted translation run', { runId });
  }
  await recoverWritingModeSwitch(boss);
  // Recover Feishu deliveries left claimed by a worker that died mid-send, then
  // kick a delivery tick if any are due (FR-021/SC-005 restart recovery).
  const recoveredFeishu = await recoverStaleFeishuDeliveries();
  if (recoveredFeishu > 0) {
    logger.info('recovered stale feishu deliveries', { count: recoveredFeishu });
    await boss.send(QUEUES.feishuDelivery, {});
  }
  const metadataBackfill = await runPageMetadataBackfill();
  if (metadataBackfill.scanned > 0) {
    logger.info('page metadata backfill progress', metadataBackfill);
  }
}
