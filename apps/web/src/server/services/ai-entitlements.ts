import { eq } from 'drizzle-orm';
import type { AiEntitlementUpdate, AiEntitlementView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { getAiSettings } from './ai-actions';

const disabled = {
  questionAnsweringEnabled: false,
  textOptimizationEnabled: false,
  imageGenerationEnabled: false,
};

function assertAdmin(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage AI access');
  }
}

async function availabilityReasons(): Promise<string[]> {
  const settings = await getAiSettings();
  if (!settings.enabled) return ['AI_DISABLED'];
  const rows = await db.select().from(schema.aiPurposeAssignments);
  const purposes = new Set(rows.map((row) => row.purpose));
  const reasons = [];
  if (!purposes.has('wiki_text')) reasons.push('TEXT_MODEL_MISSING');
  if (!purposes.has('wiki_embedding')) reasons.push('EMBEDDING_MODEL_MISSING');
  if (!purposes.has('wiki_image')) reasons.push('IMAGE_MODEL_MISSING');
  return reasons;
}

export async function getUserEntitlements(ctx: PermCtx, userId: string): Promise<AiEntitlementView> {
  assertAdmin(ctx);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new DomainError('NOT_FOUND', 'User not found');
  const row = await db.query.userAiEntitlements.findFirst({
    where: eq(schema.userAiEntitlements.userId, userId),
  });
  const reasons = await availabilityReasons();
  return {
    userId,
    ...(row ?? disabled),
    aiEnabled: user.status === 'active' && !reasons.includes('AI_DISABLED'),
    reasons: user.status === 'active' ? reasons : ['USER_DISABLED', ...reasons],
  };
}

export async function updateUserEntitlements(
  ctx: PermCtx,
  userId: string,
  input: AiEntitlementUpdate,
): Promise<AiEntitlementView> {
  assertAdmin(ctx);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new DomainError('NOT_FOUND', 'User not found');
  await db
    .insert(schema.userAiEntitlements)
    .values({ userId, ...input, updatedBy: getActorUserId(ctx) })
    .onConflictDoUpdate({
      target: schema.userAiEntitlements.userId,
      set: { ...input, updatedBy: getActorUserId(ctx), updatedAt: new Date() },
    });
  return getUserEntitlements(ctx, userId);
}

export async function getMyEntitlements(ctx: PermCtx): Promise<AiEntitlementView> {
  if (ctx.actor.kind !== 'user') throw new DomainError('UNAUTHORIZED', 'Sign in to use AI');
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, ctx.actor.userId) });
  if (!user || user.status !== 'active') throw new DomainError('UNAUTHORIZED', 'User is disabled');
  const row = await db.query.userAiEntitlements.findFirst({
    where: eq(schema.userAiEntitlements.userId, ctx.actor.userId),
  });
  const reasons = await availabilityReasons();
  return {
    userId: ctx.actor.userId,
    ...(row ?? disabled),
    aiEnabled: !reasons.includes('AI_DISABLED'),
    reasons,
  };
}

export async function assertAiFeature(
  ctx: PermCtx,
  feature: 'question' | 'text' | 'image' | 'search',
): Promise<AiEntitlementView> {
  const entitlements = await getMyEntitlements(ctx);
  if (!entitlements.aiEnabled) throw new DomainError('AI_DISABLED', 'AI features are disabled');
  if (feature === 'question' && !entitlements.questionAnsweringEnabled) {
    throw new DomainError('AI_FEATURE_DISABLED', 'Question answering is not enabled for this user');
  }
  if (feature === 'text') {
    if (!can(ctx, 'use_ai_text_optimization', { kind: 'ai_page' })) {
      throw new DomainError('FORBIDDEN', 'Only Editors and Admins can optimize page text');
    }
    if (!entitlements.textOptimizationEnabled) {
      throw new DomainError('AI_FEATURE_DISABLED', 'Text optimization is not enabled for this user');
    }
  }
  if (feature === 'image') {
    if (!can(ctx, 'use_ai_image_generation', { kind: 'ai_page' })) {
      throw new DomainError('FORBIDDEN', 'Only Editors and Admins can generate page images');
    }
    if (!entitlements.imageGenerationEnabled) {
      throw new DomainError('AI_FEATURE_DISABLED', 'Image generation is not enabled for this user');
    }
  }
  if (feature === 'search' && !can(ctx, 'use_ai_search', { kind: 'ai_index' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to use semantic search');
  }
  return entitlements;
}
