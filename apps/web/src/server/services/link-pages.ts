import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';

function retiredOperation(): never {
  throw new DomainError('LINK_TARGET_INVALID', 'Link pages are retired and can no longer be created or changed');
}

/** Retained only to give former integrations a clear unsupported outcome. */
export async function createLinkPage(_ctx: PermCtx, _input: { path: string; title?: string; targetPageId: string }): Promise<{ pageId: string; versionId: string }> {
  return retiredOperation();
}

/** Retained only to give former integrations a clear unsupported outcome. */
export async function retargetLinkPage(_ctx: PermCtx, _pageId: string, _targetPageId: string, _options?: { expectedRevisionId?: string }): Promise<{ versionId: string }> {
  return retiredOperation();
}

/** Retained only to give former integrations a clear unsupported outcome. */
export async function deleteLinkPage(_ctx: PermCtx, _pageId: string): Promise<void> {
  return retiredOperation();
}

/** Retire all active links without deleting their page or revision history. */
export async function retireLinkPages(ctx: PermCtx): Promise<{ retiredCount: number; alreadyRetiredCount: number }> {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only Administrators can retire link pages');
  }
  const retiredBy = getActorUserId(ctx);
  const result = await db.transaction(async (tx) => {
    const active = await tx.query.pages.findMany({
      where: and(eq(schema.pages.kind, 'link'), isNull(schema.pages.deletedAt)),
    });
    let retiredCount = 0;
    let alreadyRetiredCount = 0;
    for (const link of active) {
      if (!link.linkTargetPageId) continue;
      const existing = await tx.query.retiredLinkPages.findFirst({
        where: eq(schema.retiredLinkPages.linkPageId, link.id),
      });
      if (existing) {
        await tx.update(schema.pages).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.pages.id, link.id));
        alreadyRetiredCount += 1;
        continue;
      }
      const target = await tx.query.pages.findFirst({ where: eq(schema.pages.id, link.linkTargetPageId) });
      await tx.insert(schema.retiredLinkPages).values({
        linkPageId: link.id,
        legacyPath: link.path,
        targetPageId: link.linkTargetPageId,
        retiredBy,
        disposition: target?.currentPublishedVersionId && target.visibility === 'public' ? 'redirectable' : 'unavailable',
      });
      await tx.update(schema.pages).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.pages.id, link.id));
      retiredCount += 1;
    }
    return { retiredCount, alreadyRetiredCount };
  });
  if (result.retiredCount) {
    invalidatePublicContentCache();
    await notifyPublicContentChanged('publish');
  }
  return result;
}

/** A former Wiki-path link can redirect only after callers re-check its target. */
export async function findRetiredLinkTarget(legacyPath: string): Promise<{ path: string; spaceSlug: string } | null> {
  const retired = await db.query.retiredLinkPages.findFirst({
    where: eq(schema.retiredLinkPages.legacyPath, legacyPath),
  });
  if (!retired) return null;
  const target = await db.query.pages.findFirst({
    where: and(eq(schema.pages.id, retired.targetPageId), isNull(schema.pages.deletedAt)),
  });
  if (!target?.currentPublishedVersionId || target.visibility !== 'public') return null;
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.id, target.spaceId) });
  return space ? { path: target.path, spaceSlug: space.slug } : null;
}

/** Link pages never resolve as normal content after feature 032. */
export async function resolveContentPage(
  page: typeof schema.pages.$inferSelect,
): Promise<typeof schema.pages.$inferSelect | null> {
  return page.kind === 'native' ? page : null;
}

/** Link pages never resolve as normal content after feature 032. */
export async function resolveContentRevision(
  page: typeof schema.pages.$inferSelect,
  revision: typeof schema.pageRevisions.$inferSelect,
): Promise<typeof schema.pageRevisions.$inferSelect | null> {
  return page.kind === 'native' ? revision : null;
}

/** Retired links are not part of normal cache fan-out. */
export async function listLiveLinksForTarget(_targetPageId: string): Promise<string[]> {
  return [];
}
