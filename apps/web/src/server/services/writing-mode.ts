import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { enqueue, getBoss, QUEUES } from '@/server/jobs/runtime';
import type { PermCtx } from '@/server/permissions';
import { shouldUseDataCache } from '@/server/cache/public-cache';
import type { SpaceKind } from '@/server/services/spaces';

export const WRITING_MODE_CACHE_TAG = 'writing-mode';

const SETTINGS_ID = 'default';

export type WritingMode = typeof schema.writingModeSettings.$inferSelect.mode;
export type WritingModeVisibility = 'public' | 'restricted';
export type WritingModeSwitchOptions = {
  rawVisibility: WritingModeVisibility;
  generatedVisibility: WritingModeVisibility;
};

type SettingsRow = typeof schema.writingModeSettings.$inferSelect;
type ContentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function readOrSeedSettings(): Promise<SettingsRow | null> {
  const existing = await db.query.writingModeSettings.findFirst({
    where: eq(schema.writingModeSettings.id, SETTINGS_ID),
  });
  if (existing) return existing;
  await db
    .insert(schema.writingModeSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing();
  return (
    (await db.query.writingModeSettings.findFirst({
      where: eq(schema.writingModeSettings.id, SETTINGS_ID),
    })) ?? null
  );
}

async function readMode(): Promise<WritingMode> {
  return (await readOrSeedSettings())?.mode ?? 'copilot';
}

const getCachedMode = unstable_cache(async () => readMode(), ['writing-mode'], {
  revalidate: 300,
  tags: [WRITING_MODE_CACHE_TAG],
});

export async function getMode(): Promise<WritingMode> {
  return shouldUseDataCache() ? getCachedMode() : readMode();
}

export async function isLlmWikiMode(): Promise<boolean> {
  return (await getMode()) === 'llm-wiki';
}

export function invalidateWritingModeCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(WRITING_MODE_CACHE_TAG, 'max');
}

export async function setModeInternal(mode: WritingMode, userId: string | null): Promise<WritingMode> {
  await db
    .insert(schema.writingModeSettings)
    .values({ id: SETTINGS_ID, mode, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.writingModeSettings.id,
      set: {
        mode,
        pendingMode: null,
        switchJobId: null,
        switchOptions: null,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });
  invalidateWritingModeCache();
  return mode;
}

export async function setMode(ctx: PermCtx, mode: WritingMode): Promise<WritingMode> {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to change the writing mode');
  }
  return setModeInternal(mode, ctx.actor.userId);
}

export type WritingModeSwitchState = {
  mode: WritingMode;
  pendingMode: WritingMode | null;
  switchJobId: string | null;
};

export type SwitchModeResult =
  | { status: 'unchanged'; mode: WritingMode }
  | { status: 'updated'; mode: WritingMode }
  | { status: 'pending'; jobId: string };

export type WritingModeSwitchJobView = {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  report: Record<string, unknown> | null;
};

export async function getSwitchState(): Promise<WritingModeSwitchState> {
  const row = await readOrSeedSettings();
  return {
    mode: row?.mode ?? 'copilot',
    pendingMode: row?.pendingMode ?? null,
    switchJobId: row?.switchJobId ?? null,
  };
}

/** Mark an async mode switch as pending; content writes pause until it clears. */
export async function beginPendingSwitch(
  mode: WritingMode,
  jobId: string,
  userId: string | null,
  options: WritingModeSwitchOptions | null = null,
): Promise<void> {
  await db
    .insert(schema.writingModeSettings)
    .values({
      id: SETTINGS_ID,
      pendingMode: mode,
      switchJobId: jobId,
      switchOptions: options,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.writingModeSettings.id,
      set: {
        pendingMode: mode,
        switchJobId: jobId,
        switchOptions: options,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });
  invalidateWritingModeCache();
}

export async function clearPendingSwitch(userId: string | null): Promise<void> {
  await db
    .update(schema.writingModeSettings)
    .set({ pendingMode: null, switchJobId: null, switchOptions: null, updatedBy: userId, updatedAt: new Date() })
    .where(eq(schema.writingModeSettings.id, SETTINGS_ID));
  invalidateWritingModeCache();
}

/** Clears only the pending transition owned by this job. This prevents a stale
 * enqueue or worker failure from undoing a newer accepted switch. */
export async function clearPendingSwitchIfMatches(jobId: string, userId: string | null): Promise<void> {
  await db
    .update(schema.writingModeSettings)
    .set({ pendingMode: null, switchJobId: null, switchOptions: null, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(schema.writingModeSettings.id, SETTINGS_ID), eq(schema.writingModeSettings.switchJobId, jobId)));
  invalidateWritingModeCache();
}

function requireAdmin(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to change the writing mode');
  }
  return ctx.actor.userId;
}

function validSwitchOptions(value: WritingModeSwitchOptions | undefined): value is WritingModeSwitchOptions {
  return value?.rawVisibility !== undefined && value.generatedVisibility !== undefined;
}

/**
 * Changes the instance writing mode. The forward transition has no data work;
 * switching back records a durable pending marker before queueing the migration.
 */
export async function switchMode(
  ctx: PermCtx,
  target: WritingMode,
  options?: WritingModeSwitchOptions,
): Promise<SwitchModeResult> {
  const userId = requireAdmin(ctx);
  await readOrSeedSettings();

  const jobId = randomUUID();
  const decision = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from writing_mode_settings where id = ${SETTINGS_ID} for update`);
    const settings = await tx.query.writingModeSettings.findFirst({
      where: eq(schema.writingModeSettings.id, SETTINGS_ID),
    });
    if (!settings) throw new Error('Writing mode settings are unavailable');

    if (settings.pendingMode) {
      if (settings.pendingMode === target && settings.switchJobId) {
        return { kind: 'existing' as const, jobId: settings.switchJobId };
      }
      throw new DomainError('MODE_SWITCH_IN_PROGRESS', 'A writing-mode switch is already in progress');
    }

    if (settings.mode === target) return { kind: 'unchanged' as const, mode: target };

    if (settings.mode === 'copilot' && target === 'llm-wiki') {
      await tx
        .update(schema.writingModeSettings)
        .set({ mode: target, updatedBy: userId, updatedAt: new Date() })
        .where(eq(schema.writingModeSettings.id, SETTINGS_ID));
      return { kind: 'updated' as const, mode: target };
    }

    if (settings.mode !== 'llm-wiki' || target !== 'copilot' || !validSwitchOptions(options)) {
      throw new DomainError(
        'MODE_SWITCH_INVALID',
        'Switching from LLM Wiki to Copilot requires raw and generated visibility choices',
      );
    }

    await tx
      .update(schema.writingModeSettings)
      .set({
        pendingMode: target,
        switchJobId: jobId,
        switchOptions: options,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.writingModeSettings.id, SETTINGS_ID));
    return { kind: 'created' as const, jobId };
  });

  if (decision.kind === 'unchanged') return { status: 'unchanged', mode: decision.mode };
  if (decision.kind === 'updated') {
    invalidateWritingModeCache();
    return { status: 'updated', mode: decision.mode };
  }
  if (decision.kind === 'existing') return { status: 'pending', jobId: decision.jobId };

  try {
    const queued = await enqueue(
      QUEUES.writingModeSwitch,
      { rawVisibility: options!.rawVisibility, generatedVisibility: options!.generatedVisibility },
      { id: decision.jobId },
    );
    if (!queued) throw new Error('The writing-mode switch queue is unavailable');
  } catch (error) {
    await clearPendingSwitchIfMatches(decision.jobId, userId);
    throw new DomainError(
      'JOB_QUEUE_UNAVAILABLE',
      error instanceof Error ? error.message : 'The writing-mode switch queue is unavailable',
    );
  }

  return { status: 'pending', jobId: decision.jobId };
}

/** Returns the retained pg-boss output for the admin switch-progress surface. */
export async function getWritingModeSwitchJob(
  ctx: PermCtx,
  jobId: string,
): Promise<WritingModeSwitchJobView | null> {
  requireAdmin(ctx);
  const boss = getBoss();
  if (!boss) return { jobId, status: 'pending', report: null };
  const job = await boss.getJobById(QUEUES.writingModeSwitch, jobId);
  if (!job) return null;
  const status = job.state === 'active'
    ? 'running'
    : job.state === 'completed'
      ? 'completed'
      : job.state === 'failed' || job.state === 'cancelled'
        ? 'failed'
        : 'pending';
  return {
    jobId,
    status,
    report: job.output && typeof job.output === 'object' ? job.output as Record<string, unknown> : null,
  };
}

/**
 * Write barrier: the first DB lock of every content-mutation transaction takes
 * the mode singleton row FOR SHARE and refuses the write while an async mode
 * switch is pending. A missing row means defaults (no pending switch).
 */
export async function assertNoSwitchInProgress(tx: ContentTx): Promise<void> {
  const rows = (await tx.execute(
    sql`select pending_mode from writing_mode_settings where id = ${SETTINGS_ID} for share`,
  )) as unknown as Array<{ pending_mode: WritingMode | null }>;
  if (rows[0]?.pending_mode) {
    throw new DomainError(
      'MODE_SWITCH_IN_PROGRESS',
      'A writing-mode switch is in progress; content writes are paused',
    );
  }
}

/** Raw/generated spaces only exist once the instance runs in LLM Wiki mode. */
export async function assertSpaceKindAllowed(spaceKind: SpaceKind): Promise<void> {
  if (spaceKind === 'wiki') return;
  if ((await getMode()) === 'copilot') {
    throw new DomainError(
      'SPACE_UNAVAILABLE',
      `Space kind '${spaceKind}' is unavailable in copilot writing mode`,
    );
  }
}
