import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { PublicPageRenderingResult } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { renderMarkdown } from '@/server/pipeline';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { can, getActorUserId, pagePermissionOptions, type PermCtx } from '@/server/permissions';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import { canonicalSpacePath } from '@/server/services/space-routes';

/**
 * Re-run the Markdown pipeline over a page's live revisions and store the
 * result.
 *
 * Rendered HTML is produced once, at write time, so a fix to the render
 * pipeline only reaches pages that are written again afterwards — and a page
 * cannot be saved without changing it. This is the escape hatch: it renders the
 * stored source again with the current pipeline, leaving the source, the
 * content hash, the revision history, and the publication state untouched.
 *
 * Only the two revisions a reader or an editor can land on are re-rendered —
 * the published one and the latest draft. Superseded revisions keep the HTML
 * they were written with; the history view is a record of what was published,
 * and re-rendering an unbounded revision list on a request is not worth it.
 */
export async function rerenderPage(ctx: PermCtx, pageId: string): Promise<PublicPageRenderingResult> {
  const userId = getActorUserId(ctx);
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to re-render a page');

  const page = await db.query.pages.findFirst({
    where: and(eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt)),
  });
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  if (page.kind === 'link') throw new DomainError('LINK_TARGET_INVALID', 'Link pages have no rendered content');

  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.id, page.spaceId) });
  if (!space) throw new DomainError('NOT_FOUND', 'Space not found');

  if (!can(
    ctx,
    'edit',
    { kind: 'page', pageId: page.id },
    pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }),
  )) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to re-render this page');
  }

  const liveRevisionIds = [...new Set(
    [page.currentPublishedVersionId, page.latestVersionId].filter((id): id is string => id !== null),
  )];
  if (liveRevisionIds.length === 0) throw new DomainError('NOT_FOUND', 'Page has no revision to render');

  const revisions = await db.query.pageRevisions.findMany({
    where: inArray(schema.pageRevisions.id, liveRevisionIds),
  });

  let revisionsChanged = 0;
  let publishedChanged = false;
  for (const revision of revisions) {
    const source = await readMarkdownFromDatabase(revision);
    const { html } = renderMarkdown(source);
    if (html === revision.contentHtml) continue;
    await db
      .update(schema.pageRevisions)
      .set({ contentHtml: html })
      .where(eq(schema.pageRevisions.id, revision.id));
    revisionsChanged += 1;
    if (revision.id === page.currentPublishedVersionId) publishedChanged = true;
  }

  if (revisionsChanged > 0) {
    invalidatePublicContentCache();
    if (publishedChanged) {
      await enqueuePublicPageWarmup(canonicalSpacePath(space, page.slug || page.path, page.locale));
      // The static site renders from source, so it carries the same stale
      // output until it is regenerated with the fixed pipeline.
      await notifyPublicContentChanged('publish');
    }
  }

  return { pageId: page.id, revisionsRendered: revisions.length, revisionsChanged };
}
