import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertAiFeature } from './ai-entitlements';
import { assertEditableRevision } from './ai-optimization';
import { uploadImage } from './content-assets';

async function requireArtifactAccess(ctx: PermCtx, artifactId: string, allowExpired = false) {
  const rows = await db
    .select({ artifact: schema.aiGeneratedArtifacts, action: schema.aiActions })
    .from(schema.aiGeneratedArtifacts)
    .innerJoin(schema.aiActions, eq(schema.aiGeneratedArtifacts.actionId, schema.aiActions.id))
    .where(
      and(
        eq(schema.aiGeneratedArtifacts.id, artifactId),
        allowExpired ? undefined : gt(schema.aiGeneratedArtifacts.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (
    !row ||
    ctx.actor.kind !== 'user' ||
    (row.action.actorUserId !== getActorUserId(ctx) && !can(ctx, 'manage_ai', { kind: 'ai_settings' }))
  ) {
    throw new DomainError('NOT_FOUND', 'Generated artifact not found');
  }
  return row;
}

export async function getGeneratedArtifact(ctx: PermCtx, artifactId: string) {
  const { artifact } = await requireArtifactAccess(ctx, artifactId);
  return { bytes: Buffer.from(artifact.bytes), contentType: artifact.contentType, expiresAt: artifact.expiresAt };
}

export async function discardGeneratedArtifact(ctx: PermCtx, artifactId: string): Promise<void> {
  const { artifact } = await requireArtifactAccess(ctx, artifactId, true);
  if (artifact.promotedAssetId) throw new DomainError('CONFLICT', 'Promoted artifacts cannot be discarded');
  await db.delete(schema.aiGeneratedArtifacts).where(eq(schema.aiGeneratedArtifacts.id, artifactId));
}

export async function promoteGeneratedArtifact(ctx: PermCtx, artifactId: string, pageId: string) {
  const { artifact, action } = await requireArtifactAccess(ctx, artifactId);
  await assertAiFeature(ctx, 'image');
  if (!action.pageId || action.pageId !== pageId) throw new DomainError('FORBIDDEN', 'Artifact does not belong to this page');
  if (!action.actorUserId) throw new DomainError('NOT_FOUND', 'Generated artifact not found');
  if (artifact.promotedAssetId) {
    return { id: artifact.promotedAssetId, url: `/api/assets/${artifact.promotedAssetId}`, contentType: artifact.contentType, sizeBytes: artifact.sizeBytes };
  }
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  if (!page?.latestVersionId) throw new DomainError('NOT_FOUND', 'Page not found');
  await assertEditableRevision(ctx, pageId, page.latestVersionId);
  const asset = await uploadImage(ctx, Buffer.from(artifact.bytes));
  await db
    .update(schema.aiGeneratedArtifacts)
    .set({ promotedAssetId: asset.id, promotedAt: new Date() })
    .where(eq(schema.aiGeneratedArtifacts.id, artifactId));
  return asset;
}
