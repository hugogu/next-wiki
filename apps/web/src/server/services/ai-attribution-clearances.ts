import { and, desc, eq, isNull } from 'drizzle-orm';
import type { AiAttributionClearance, AiAttributionClearanceInput } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, pagePermissionOptions, type PermCtx } from '@/server/permissions';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { getSpaceById } from './spaces';
import { notifyPublicContentChanged } from './public-content-events';
import { aiContentLevelSql } from './ai-content-level';

type ClearanceRow = typeof schema.pageAiAttributionClearances.$inferSelect;
function clearanceResource(row: ClearanceRow): AiAttributionClearance {
  return { ...row, clearedAt: row.clearedAt.toISOString() };
}

function requireHuman(ctx: PermCtx) {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('FORBIDDEN', 'AI attribution can only be changed by a signed-in human author or Administrator');
  }
  return ctx.actor;
}

function requirePageAuthorOrAdmin(ctx: PermCtx, page: { id: string; authorId: string }) {
  const actor = requireHuman(ctx);
  if (!can(ctx, 'clear_ai_attribution', { kind: 'page', pageId: page.id }, { isAuthor: actor.userId === page.authorId })) {
    throw new DomainError('FORBIDDEN', 'Only the page author or an Administrator can change AI attribution');
  }
}

export async function setAiAttribution(ctx: PermCtx, pageId: string, input: AiAttributionClearanceInput): Promise<AiAttributionClearance> {
  const actor = requireHuman(ctx);
  const record = await db.transaction(async (tx) => {
    // Serialize declarations with page writes, and validate the reviewed version
    // after taking the lock so an intervening edit cannot be relabeled unseen.
    const [page] = await tx.select().from(schema.pages)
      .where(and(eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt))).for('update');
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    requirePageAuthorOrAdmin(ctx, page);
    const space = await getSpaceById(page.spaceId);
    if (!space || !can(ctx, 'read', { kind: 'page', pageId }, pagePermissionOptions(space, page, { isAuthor: actor.userId === page.authorId }))) {
      throw new DomainError('NOT_FOUND', 'Page not found');
    }
    if (page.latestVersionId !== input.expectedRevisionId) {
      throw new DomainError('STALE_REVISION', 'Review the latest page revision before changing AI attribution');
    }
    const revision = await tx.query.pageRevisions.findFirst({
      where: and(eq(schema.pageRevisions.id, input.expectedRevisionId), eq(schema.pageRevisions.pageId, pageId), isNull(schema.pageRevisions.deletedAt)),
    });
    if (!revision) throw new DomainError('NOT_FOUND', 'Revision not found');
    const [current] = await tx.select({ level: aiContentLevelSql() }).from(schema.pages).where(eq(schema.pages.id, pageId));
    const targetLevel = input.level ?? null;
    const operation = targetLevel === null ? 'clear' : 'set';
    const existing = await tx.query.pageAiAttributionClearances.findFirst({
      where: and(
        eq(schema.pageAiAttributionClearances.pageId, pageId),
        eq(schema.pageAiAttributionClearances.revisionId, revision.id),
        eq(schema.pageAiAttributionClearances.operation, operation),
        targetLevel ? eq(schema.pageAiAttributionClearances.level, targetLevel) : isNull(schema.pageAiAttributionClearances.level),
      ),
    });
    if (existing) return existing;
    if (targetLevel === null && !current?.level) throw new DomainError('CONFLICT', 'This page has no AI attribution to clear');
    const [created] = await tx.insert(schema.pageAiAttributionClearances).values({
      pageId,
      revisionId: revision.id,
      versionNumber: revision.versionNumber,
      operation,
      level: targetLevel,
      previousLevel: current?.level ?? null,
      clearedByUserId: actor.userId,
    }).returning();
    if (!created) throw new Error('Failed to record AI attribution clearance');
    return created;
  });
  invalidatePublicContentCache();
  await notifyPublicContentChanged('publish');
  return clearanceResource(record);
}

export const clearAiAttribution = setAiAttribution;

export async function listAiAttributionClearances(ctx: PermCtx, pageId: string): Promise<{ items: AiAttributionClearance[] }> {
  requireHuman(ctx);
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  requirePageAuthorOrAdmin(ctx, page);
  const records = await db.query.pageAiAttributionClearances.findMany({
    where: eq(schema.pageAiAttributionClearances.pageId, pageId),
    orderBy: [desc(schema.pageAiAttributionClearances.versionNumber), desc(schema.pageAiAttributionClearances.clearedAt)],
  });
  return { items: records.map(clearanceResource) };
}
