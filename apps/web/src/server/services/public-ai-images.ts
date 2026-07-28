import { and, eq, gt } from 'drizzle-orm';
import type { PermCtx } from '@/server/permissions';
import { buildUserCtx, can } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { appendActionEvent } from './ai-actions';
import { assertEditableRevision } from './ai-optimization';
import { createImageGeneration, type ImageGenerationInput } from './ai-image-generation';
import { discardGeneratedArtifact, getGeneratedArtifact, promoteGeneratedArtifact } from './ai-artifacts';
import { getAsset } from './public-content';

type ImageAction = typeof schema.aiActions.$inferSelect;
type GeneratedArtifact = typeof schema.aiGeneratedArtifacts.$inferSelect;

type PublicImageStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

function requireImageApiKey(ctx: PermCtx) {
  if (ctx.actor.kind !== 'api_key' || !can(ctx, 'use_ai_image_generation', { kind: 'ai_page' })) {
    throw new DomainError('FORBIDDEN', 'Image generation requires an Editor or Admin API key with the ai.image scope');
  }
  return ctx.actor;
}

function actorContext(ctx: PermCtx) {
  const actor = requireImageApiKey(ctx);
  return buildUserCtx(actor.userId, actor.role);
}

function toStatus(action: ImageAction, artifact?: GeneratedArtifact | null): PublicImageStatus {
  if (action.expiresAt <= new Date() || (action.status === 'completed' && !artifact)) return 'expired';
  if (action.status === 'completed') return 'succeeded';
  if (action.status === 'failed') return 'failed';
  if (action.status === 'cancelled') return 'cancelled';
  return action.status;
}

async function ownedImageAction(ctx: PermCtx, actionId: string): Promise<ImageAction> {
  const actor = requireImageApiKey(ctx);
  const action = await db.query.aiActions.findFirst({
    where: and(
      eq(schema.aiActions.id, actionId),
      eq(schema.aiActions.feature, 'image_generation'),
      eq(schema.aiActions.actorUserId, actor.userId),
    ),
  });
  if (!action) throw new DomainError('NOT_FOUND', 'Image generation not found');
  return action;
}

async function ownedArtifact(ctx: PermCtx, artifactId: string, allowExpired = false) {
  const actor = requireImageApiKey(ctx);
  const rows = await db
    .select({ artifact: schema.aiGeneratedArtifacts, action: schema.aiActions })
    .from(schema.aiGeneratedArtifacts)
    .innerJoin(schema.aiActions, eq(schema.aiGeneratedArtifacts.actionId, schema.aiActions.id))
    .where(and(
      eq(schema.aiGeneratedArtifacts.id, artifactId),
      eq(schema.aiActions.feature, 'image_generation'),
      eq(schema.aiActions.actorUserId, actor.userId),
      allowExpired ? undefined : gt(schema.aiGeneratedArtifacts.expiresAt, new Date()),
    ))
    .limit(1);
  if (!rows[0]) throw new DomainError('NOT_FOUND', 'Generated artifact not found');
  return rows[0];
}

export type PublicImageGeneration = {
  id: string;
  feature: 'image_generation';
  status: PublicImageStatus;
  createdAt: string;
  updatedAt: string;
  pollUrl: string;
  artifact?: {
    id: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: string;
    previewUrl: string;
    promoteUrl: string;
    discardUrl: string;
  };
  error?: { code: string; message: string };
};

function toPublicImageGeneration(action: ImageAction, artifact?: GeneratedArtifact | null): PublicImageGeneration {
  const status = toStatus(action, artifact);
  const value: PublicImageGeneration = {
    id: action.id,
    feature: 'image_generation',
    status,
    createdAt: action.queuedAt.toISOString(),
    updatedAt: (action.finishedAt ?? action.startedAt ?? action.queuedAt).toISOString(),
    pollUrl: `/api/v1/ai/images/${action.id}`,
  };
  if (status === 'succeeded' && artifact) {
    const base = `/api/v1/ai/generated-artifacts/${artifact.id}`;
    value.artifact = {
      id: artifact.id,
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
      expiresAt: artifact.expiresAt.toISOString(),
      previewUrl: base,
      promoteUrl: `${base}/asset`,
      discardUrl: base,
    };
  }
  if (status === 'failed') {
    value.error = { code: action.errorCode ?? 'IMAGE_GENERATION_FAILED', message: 'Image generation failed' };
  }
  return value;
}

export async function submitPublicImageGeneration(ctx: PermCtx, input: ImageGenerationInput): Promise<PublicImageGeneration> {
  requireImageApiKey(ctx);
  const action = await createImageGeneration(ctx, input);
  const row = await ownedImageAction(ctx, action.id);
  return toPublicImageGeneration(row);
}

export async function getPublicImageGeneration(ctx: PermCtx, actionId: string): Promise<PublicImageGeneration> {
  const action = await ownedImageAction(ctx, actionId);
  const artifact = await db.query.aiGeneratedArtifacts.findFirst({
    where: and(eq(schema.aiGeneratedArtifacts.actionId, action.id), gt(schema.aiGeneratedArtifacts.expiresAt, new Date())),
  });
  return toPublicImageGeneration(action, artifact);
}

export async function cancelPublicImageGeneration(ctx: PermCtx, actionId: string): Promise<void> {
  const action = await ownedImageAction(ctx, actionId);
  if (!['queued', 'running'].includes(action.status)) return;
  await db.update(schema.aiActions).set({ cancelRequested: true }).where(eq(schema.aiActions.id, action.id));
  await appendActionEvent(action.id, 'status', { status: 'cancel_requested' });
}

export async function getPublicGeneratedArtifact(ctx: PermCtx, artifactId: string) {
  await ownedArtifact(ctx, artifactId);
  return getGeneratedArtifact(actorContext(ctx), artifactId);
}

export async function discardPublicGeneratedArtifact(ctx: PermCtx, artifactId: string): Promise<void> {
  const { action } = await ownedArtifact(ctx, artifactId, true);
  await discardGeneratedArtifact(actorContext(ctx), artifactId);
  await appendActionEvent(action.id, 'status', { status: 'artifact_discarded', artifactId });
}

export async function promotePublicGeneratedArtifact(ctx: PermCtx, artifactId: string, pageId: string) {
  const { action, artifact } = await ownedArtifact(ctx, artifactId, true);
  if (!action.pageId || action.pageId !== pageId) {
    throw new DomainError('NOT_FOUND', 'Generated artifact not found');
  }
  const userCtx = actorContext(ctx);
  if (artifact.promotedAssetId) {
    const publicAsset = await getAsset(userCtx, artifact.promotedAssetId);
    if (!publicAsset) throw new DomainError('NOT_FOUND', 'Promoted asset not found');
    return publicAsset;
  }
  if (artifact.expiresAt <= new Date()) {
    throw new DomainError('CONFLICT', 'Generated artifact is no longer promotable');
  }
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  if (!page?.latestVersionId) throw new DomainError('NOT_FOUND', 'Generated artifact not found');
  await assertEditableRevision(ctx, pageId, page.latestVersionId);
  const asset = await promoteGeneratedArtifact(userCtx, artifactId, pageId);
  await appendActionEvent(action.id, 'status', { status: 'artifact_promoted', artifactId, assetId: asset.id });
  const publicAsset = await getAsset(userCtx, asset.id);
  if (!publicAsset) throw new DomainError('NOT_FOUND', 'Promoted asset not found');
  return publicAsset;
}
