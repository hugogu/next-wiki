import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';

const DEFAULT_SPACE_SLUG = 'default';

function getUserId(ctx: PermCtx): string | null {
  return ctx.actor.kind === 'user' ? ctx.actor.userId : null;
}

/**
 * Publish a revision: atomically set its status to 'published' and point the
 * page's `current_published_version_id` at it. Permission: author-of-draft or
 * admin (the `can('publish', ...)` chokepoint interprets the matrix).
 *
 * Published content becomes visible to readers immediately; the previous live
 * revision (if any) stays in history as a regular published revision.
 */
export async function publish(
  ctx: PermCtx,
  input: { slug: string; version: number },
): Promise<{ versionId: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to publish revisions');
  }

  return await db.transaction(async (tx) => {
    const space = await tx.query.spaces.findFirst({
      where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
    });
    if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.slug, input.slug),
        isNull(schema.pages.deletedAt),
      ),
    });
    // Identical error for missing page vs missing revision: no metadata leak.
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

    const revision = await tx.query.pageRevisions.findFirst({
      where: and(
        eq(schema.pageRevisions.pageId, page.id),
        eq(schema.pageRevisions.versionNumber, input.version),
      ),
    });
    if (!revision) throw new DomainError('NOT_FOUND', 'Revision not found');

    const isAuthor = revision.authorId === userId;
    if (!can(ctx, 'publish', { kind: 'revision', pageId: page.id, version: input.version }, { isAuthor })) {
      // FORBIDDEN (not NOT_FOUND): the caller is signed in but lacks rights.
      // We still keep the message generic to avoid leaking whether the resource
      // exists to a caller who already failed the existence check above.
      throw new DomainError('FORBIDDEN', 'You do not have permission to publish this revision');
    }

    // Idempotency: publishing an already-published revision is a no-op
    // (still returns its versionId).
    if (revision.status !== 'published') {
      await tx
        .update(schema.pageRevisions)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(schema.pageRevisions.id, revision.id));
    }

    // Atomic swap of the page's live version pointer.
    await tx
      .update(schema.pages)
      .set({
        currentPublishedVersionId: revision.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return { versionId: revision.id };
  });
}
