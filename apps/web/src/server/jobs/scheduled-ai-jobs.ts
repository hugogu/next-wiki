import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { createAction } from '@/server/services/ai-actions';
import { getAssignedModel, modelSupportsToolCalling } from '@/server/services/ai-question';
import { buildUserCtx } from '@/server/permissions';
import { runAiAction } from './ai-actions';
import { tickScheduledAiJobs } from '@/server/services/scheduled-ai-jobs';

export async function runScheduledAiTick(): Promise<void> {
  await runWithoutDataCache(() => tickScheduledAiJobs());
}

/** Claims one durable run and delegates inference to the standard AI-action worker. */
export async function runScheduledAiJobRun(runId: string): Promise<void> {
  await runWithoutDataCache(async () => {
    const [run] = await db
      .update(schema.scheduledAiJobRuns)
      .set({ status: 'running', startedAt: new Date(), attemptCount: 1, heartbeatAt: new Date() })
      .where(
        and(
          eq(schema.scheduledAiJobRuns.id, runId),
          eq(schema.scheduledAiJobRuns.status, 'queued'),
        ),
      )
      .returning();
    if (!run) return;
    if (run.cancelRequested) {
      await db
        .update(schema.scheduledAiJobRuns)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(eq(schema.scheduledAiJobRuns.id, runId));
      return;
    }
    const [job, owner] = await Promise.all([
      db.query.scheduledAiJobs.findFirst({ where: eq(schema.scheduledAiJobs.id, run.jobId) }),
      run.runAsUserId
        ? db.query.users.findFirst({ where: eq(schema.users.id, run.runAsUserId) })
        : undefined,
    ]);
    if (
      !job ||
      job.status === 'retired' ||
      !owner ||
      owner.status !== 'active' ||
      owner.deletedAt
    ) {
      await db
        .update(schema.scheduledAiJobRuns)
        .set({
          status: 'blocked',
          errorCode: 'SCHEDULED_JOB_OWNER_INELIGIBLE',
          errorMessage: 'Execution owner is no longer eligible',
          finishedAt: new Date(),
        })
        .where(eq(schema.scheduledAiJobRuns.id, runId));
      return;
    }
    try {
      const assigned = await getAssignedModel('wiki_text');
      if (!(await modelSupportsToolCalling(assigned.model.id)))
        throw new Error('TOOL_CAPABILITY_UNAVAILABLE');
      const action = await createAction(buildUserCtx(owner.id, owner.role), {
        feature: 'scheduled_ai_job',
        input: {
          question: (run.definitionSnapshot as { taskDescription: string }).taskDescription,
          mode: 'retrieval',
          requestedReview: 'admin_review',
        },
        providerId: assigned.provider.id,
        modelId: assigned.model.id,
        requestMetadata: {
          scheduledAiJobRunId: run.id,
          origin: 'scheduled_ai_job',
          toolEnabled: true,
          requestedReview: 'admin_review',
        },
        enqueue: false,
      });
      await db
        .update(schema.scheduledAiJobRuns)
        .set({ aiActionId: action.id })
        .where(eq(schema.scheduledAiJobRuns.id, runId));
      await runAiAction(action.id);
      const completed = await db.query.aiActions.findFirst({
        where: eq(schema.aiActions.id, action.id),
      });
      const status =
        completed?.status === 'completed'
          ? 'completed'
          : completed?.status === 'cancelled'
            ? 'cancelled'
            : 'failed';
      await db
        .update(schema.scheduledAiJobRuns)
        .set({
          status,
          finishedAt: new Date(),
          errorCode: completed?.errorCode ?? null,
          errorMessage: completed?.errorMessage ?? null,
          resultSummary: completed?.resultMetadata ?? {},
        })
        .where(eq(schema.scheduledAiJobRuns.id, runId));
      if (status === 'completed')
        await db
          .update(schema.scheduledAiJobs)
          .set({ lastRunAt: new Date(), lastSuccessAt: new Date() })
          .where(eq(schema.scheduledAiJobs.id, job.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scheduled AI execution failed';
      await db
        .update(schema.scheduledAiJobRuns)
        .set({
          status: 'blocked',
          errorCode: 'SCHEDULED_AI_BLOCKED',
          errorMessage: message.slice(0, 500),
          finishedAt: new Date(),
        })
        .where(eq(schema.scheduledAiJobRuns.id, runId));
    }
  });
}
