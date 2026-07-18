import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId, pagePermissionOptions } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertNotMigrating } from '@/server/services/migration';
import { enqueueGitExport } from '@/server/services/git-export';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { invalidateTranslationsForSource } from '@/server/services/translations';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import { getPageHref } from '@/lib/path';
import { resolveSpace } from '@/server/services/spaces';
import { assertNoSwitchInProgress } from '@/server/services/writing-mode';

function getUserId(ctx: PermCtx): string | null {
  return getActorUserId(ctx);
}

export async function publish(
  ctx: PermCtx,
  input: { path: string; version: number; expectedRevisionId?: string; space?: string },
): Promise<{ versionId: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to publish revisions');
  }

  await assertNotMigrating();

  const space = await resolveSpace(input.space);
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, input.path),
        isNull(schema.pages.deletedAt),
      ),
    });
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (space.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw entries are published automatically');

    const revision = await tx.query.pageRevisions.findFirst({
      where: and(
        eq(schema.pageRevisions.pageId, page.id),
        eq(schema.pageRevisions.versionNumber, input.version),
      ),
    });
    if (!revision) throw new DomainError('NOT_FOUND', 'Revision not found');

    if (input.expectedRevisionId && revision.id !== input.expectedRevisionId) {
      throw new DomainError('STALE_REVISION', 'The revision does not match the expected revision id');
    }

    const isAuthor = revision.authorId === userId;
    if (!can(
      ctx,
      'publish',
      { kind: 'revision', pageId: page.id, version: input.version },
      pagePermissionOptions(space, page, { isAuthor }),
    )) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to publish this revision');
    }

    if (revision.status !== 'published') {
      await tx
        .update(schema.pageRevisions)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(schema.pageRevisions.id, revision.id));
    }

    await tx
      .update(schema.pages)
      .set({
        currentPublishedVersionId: revision.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return { versionId: revision.id, pageId: page.id };
  });
  invalidatePublicContentCache();
  await enqueuePublicPageWarmup(getPageHref(input.path));
  await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(result.pageId, ctx);
  // Publishing a source page invalidates its translations (they now trail the
  // newest published revision). Safe no-op for translated pages.
  await invalidateTranslationsForSource(result.pageId);
  return { versionId: result.versionId };
}
