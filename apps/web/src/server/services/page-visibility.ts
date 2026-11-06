import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  MAX_BULK_VISIBILITY_PAGES,
  type BulkPageVisibilityInput,
  type BulkPageVisibilityResult,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { auditPageVisibilityChanges } from '@/server/services/audit';
import { pathInFolder } from '@/server/services/page-folders';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { resolveSpace } from '@/server/services/spaces';
import { assertSpaceKindAllowed } from '@/server/services/writing-mode';

function assertVisibilityAdmin(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only Administrators can change page visibility');
  }
  return ctx.actor.userId;
}

/** Like the admin page list, a folder covers a space's source pages, not their translations. */
async function scopeCondition(scope: BulkPageVisibilityInput['scope']) {
  if (scope.kind === 'pages') return inArray(schema.pages.id, scope.pageIds);
  const space = await resolveSpace(scope.space);
  if (!space) throw new DomainError('NOT_FOUND', 'Space not found');
  await assertSpaceKindAllowed(space.kind);
  return and(
    eq(schema.pages.spaceId, space.id),
    isNull(schema.pages.translationGroupId),
    scope.pathPrefix ? pathInFolder(scope.pathPrefix) : undefined,
  );
}

/**
 * Gives many pages one anonymous-read visibility without changing what is
 * published, page by page as a single change would: every changed page gets
 * its own audit entry, and public caches are refreshed once per request
 * rather than once per page.
 *
 * At most {@link MAX_BULK_VISIBILITY_PAGES} pages change per request, taken in
 * path order. `remaining` says how many more a folder still has; the request is
 * safe to repeat, because pages that already have the visibility are skipped.
 */
export async function setPagesVisibility(
  ctx: PermCtx,
  input: BulkPageVisibilityInput,
): Promise<BulkPageVisibilityResult> {
  const userId = assertVisibilityAdmin(ctx);
  const visibility = input.visibility;
  const inScope = and(isNull(schema.pages.deletedAt), await scopeCondition(input.scope));

  const counts = await db
    .select({
      visibility: schema.pages.visibility,
      pages: count(),
      unpublished: count(sql`case when ${schema.pages.currentPublishedVersionId} is null then 1 end`),
    })
    .from(schema.pages)
    .where(inScope)
    .groupBy(schema.pages.visibility);
  let matched = 0;
  const pending = { total: 0, public: 0, registered: 0, restricted: 0, unpublished: 0 };
  for (const row of counts) {
    matched += row.pages;
    if (row.visibility === visibility) continue;
    pending[row.visibility] += row.pages;
    pending.total += row.pages;
    pending.unpublished += row.unpublished;
  }

  const changed = input.dryRun || pending.total === 0
    ? []
    : await db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: schema.pages.id, visibility: schema.pages.visibility })
          .from(schema.pages)
          .where(and(inScope, ne(schema.pages.visibility, visibility)))
          .orderBy(asc(schema.pages.path), asc(schema.pages.id))
          .limit(MAX_BULK_VISIBILITY_PAGES)
          .for('update');
        if (rows.length === 0) return rows;
        await tx
          .update(schema.pages)
          .set({ visibility, updatedAt: new Date() })
          .where(inArray(schema.pages.id, rows.map((row) => row.id)));
        await auditPageVisibilityChanges(
          tx,
          userId,
          rows.map((row) => ({ pageId: row.id, from: row.visibility, to: visibility })),
        );
        return rows;
      });
  if (changed.length > 0) {
    invalidatePublicContentCache();
    await notifyPublicContentChanged('publish');
  }

  return {
    visibility,
    dryRun: input.dryRun ?? false,
    matched,
    pending,
    changed: changed.length,
    remaining: Math.max(0, pending.total - changed.length),
    results: input.dryRun ? [] : await outcomes(input.scope, inScope, changed, visibility),
  };
}

async function outcomes(
  scope: BulkPageVisibilityInput['scope'],
  inScope: ReturnType<typeof and>,
  changed: { id: string; visibility: BulkPageVisibilityResult['visibility'] }[],
  visibility: BulkPageVisibilityResult['visibility'],
): Promise<BulkPageVisibilityResult['results']> {
  if (scope.kind === 'folder') {
    return changed.map((row) => ({ pageId: row.id, outcome: 'changed' as const, previousVisibility: row.visibility }));
  }
  const previous = new Map(changed.map((row) => [row.id, row.visibility]));
  const found = new Set(
    (await db.select({ id: schema.pages.id }).from(schema.pages).where(inScope)).map((row) => row.id),
  );
  return [...new Set(scope.pageIds)].map((pageId) => {
    const previousVisibility = previous.get(pageId);
    if (previousVisibility) return { pageId, outcome: 'changed' as const, previousVisibility };
    if (found.has(pageId)) return { pageId, outcome: 'unchanged' as const, previousVisibility: visibility };
    return { pageId, outcome: 'not_found' as const, previousVisibility: null };
  });
}
