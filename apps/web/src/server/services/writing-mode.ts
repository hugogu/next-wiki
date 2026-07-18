import { eq, sql } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { shouldUseDataCache } from '@/server/cache/public-cache';
import type { SpaceKind } from '@/server/services/spaces';

export const WRITING_MODE_CACHE_TAG = 'writing-mode';

const SETTINGS_ID = 'default';

export type WritingMode = typeof schema.writingModeSettings.$inferSelect.mode;

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
      set: { mode, updatedBy: userId, updatedAt: new Date() },
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
): Promise<void> {
  await db
    .insert(schema.writingModeSettings)
    .values({
      id: SETTINGS_ID,
      pendingMode: mode,
      switchJobId: jobId,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.writingModeSettings.id,
      set: { pendingMode: mode, switchJobId: jobId, updatedBy: userId, updatedAt: new Date() },
    });
  invalidateWritingModeCache();
}

export async function clearPendingSwitch(userId: string | null): Promise<void> {
  await db
    .update(schema.writingModeSettings)
    .set({ pendingMode: null, switchJobId: null, updatedBy: userId, updatedAt: new Date() })
    .where(eq(schema.writingModeSettings.id, SETTINGS_ID));
  invalidateWritingModeCache();
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
