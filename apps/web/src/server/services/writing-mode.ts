import { eq } from 'drizzle-orm';
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

async function readMode(): Promise<WritingMode> {
  const existing = await db.query.writingModeSettings.findFirst({
    where: eq(schema.writingModeSettings.id, SETTINGS_ID),
  });
  if (existing) return existing.mode;
  await db
    .insert(schema.writingModeSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing();
  const seeded = await db.query.writingModeSettings.findFirst({
    where: eq(schema.writingModeSettings.id, SETTINGS_ID),
  });
  return seeded?.mode ?? 'copilot';
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
