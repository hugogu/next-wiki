import { eq } from 'drizzle-orm';
import {
  DEFAULT_WIKI_QUESTION_MIN_RELEVANCE_SCORE,
  type BotGeneralSettings,
  type UpdateBotGeneralSettings,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getActorUserId, type PermCtx } from '@/server/permissions';

const SETTINGS_ID = 'default';
const SCORE_SCALE = 1_000;

function assertAdmin(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage bot settings');
  }
}

function fromStored(value: number): number {
  return value / SCORE_SCALE;
}

function toStored(value: number): number {
  return Math.round(value * SCORE_SCALE);
}

export async function getBotGeneralSettings(): Promise<BotGeneralSettings> {
  const row = await db.query.aiSettings.findFirst({ where: eq(schema.aiSettings.id, SETTINGS_ID) });
  return {
    wikiQuestionMinRelevanceScore: row
      ? fromStored(row.wikiQuestionMinRelevanceScore)
      : DEFAULT_WIKI_QUESTION_MIN_RELEVANCE_SCORE,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function readBotGeneralSettings(ctx: PermCtx): Promise<BotGeneralSettings> {
  assertAdmin(ctx);
  return getBotGeneralSettings();
}

export async function updateBotGeneralSettings(
  ctx: PermCtx,
  input: UpdateBotGeneralSettings,
): Promise<BotGeneralSettings> {
  assertAdmin(ctx);
  const values = {
    wikiQuestionMinRelevanceScore: toStored(input.wikiQuestionMinRelevanceScore),
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.aiSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.aiSettings.id, set: values });
  return getBotGeneralSettings();
}
