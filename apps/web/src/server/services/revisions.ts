import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId, pagePermissionOptions } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertNotMigrating } from '@/server/services/migration';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { invalidateTranslationsForSource } from '@/server/services/translations';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import { getPageHref } from '@/lib/path';
import { resolveSpace } from '@/server/services/spaces';
import { assertNoSwitchInProgress, assertSpaceKindAllowed } from '@/server/services/writing-mode';

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
  await assertSpaceKindAllowed(space.kind);

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
    if (page.kind === 'link') throw new DomainError('LINK_TARGET_INVALID', 'Link pages are published when created or retargeted');

    const revision = await tx.query.pageRevisions.findFirst({
      where: and(
        eq(schema.pageRevisions.pageId, page.id),
        eq(schema.pageRevisions.versionNumber, input.version),
        isNull(schema.pageRevisions.deletedAt),
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

    return { versionId: revision.id, pageId: page.id, slug: page.slug, path: page.path };
  });
  invalidatePublicContentCache();
  await enqueuePublicPageWarmup(getPageHref(result.slug || result.path));
  await notifyPublicContentChanged('publish');
  await reconcilePageAcrossIndexes(result.pageId, ctx);
  // Publishing a source page invalidates its translations (they now trail the
  // newest published revision). Safe no-op for translated pages.
  await invalidateTranslationsForSource(result.pageId);
  return { versionId: result.versionId };
}

export async function remove(
  ctx: PermCtx,
  input: { pageId: string; version: number; space?: string },
): Promise<void> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to delete revisions');
  }

  await assertNotMigrating();

  const space = await resolveSpace(input.space);
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  await assertSpaceKindAllowed(space.kind);

  await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    // Looked up by id, not (spaceId, path): pages are only unique on
    // (spaceId, path, locale), so a path-only lookup could resolve to a
    // different locale's page (e.g. a translation sharing the same path)
    // and delete the wrong revision.
    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.id, input.pageId),
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
      ),
    });
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (page.kind === 'link') throw new DomainError('LINK_TARGET_INVALID', 'Link pages have no deletable revisions');

    const revision = await tx.query.pageRevisions.findFirst({
      where: and(
        eq(schema.pageRevisions.pageId, page.id),
        eq(schema.pageRevisions.versionNumber, input.version),
        isNull(schema.pageRevisions.deletedAt),
      ),
    });
    if (!revision) throw new DomainError('NOT_FOUND', 'Revision not found');

    const isAuthor = revision.authorId === userId;
    if (!can(
      ctx,
      'delete',
      { kind: 'revision', pageId: page.id, version: input.version },
      pagePermissionOptions(space, page, { isAuthor }),
    )) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to delete this revision');
    }

    if (revision.id === page.currentPublishedVersionId) {
      throw new DomainError('REVISION_NOT_DELETABLE', 'Cannot delete the currently published revision');
    }
    if (revision.id === page.latestVersionId) {
      throw new DomainError('REVISION_NOT_DELETABLE', 'Cannot delete the latest revision');
    }

    await tx
      .update(schema.pageRevisions)
      .set({ deletedAt: new Date() })
      .where(eq(schema.pageRevisions.id, revision.id));
  });
  invalidatePublicContentCache();
}
