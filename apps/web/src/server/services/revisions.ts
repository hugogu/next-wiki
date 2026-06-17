import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';

const DEFAULT_SPACE_SLUG = 'default';

function getUserId(ctx: PermCtx): string | null {
  return ctx.actor.kind === 'user' ? ctx.actor.userId : null;
}

export async function publish(
  ctx: PermCtx,
  input: { path: string; version: number },
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
        eq(schema.pages.path, input.path),
        isNull(schema.pages.deletedAt),
      ),
    });
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

    return { versionId: revision.id };
  });
}
