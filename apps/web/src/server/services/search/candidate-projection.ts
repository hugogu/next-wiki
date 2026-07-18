import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { PublicPageResource } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { parsePageFrontmatter } from '@/server/transfers/frontmatter';
import { getRevisionMetadata } from '@/server/services/page-metadata';
import { resolveSpace } from '@/server/services/spaces';

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function links(page: { id: string; path: string }) {
  return {
    self: `/api/v1/pages/${page.id}`,
    byPath: `/api/v1/pages?path=${encodePath(page.path)}`,
    revisions: `/api/v1/pages/${page.id}/revisions`,
    drafts: `/api/v1/pages/${page.id}/drafts`,
  };
}

/** A candidate that survived the central visibility projection. */
export type ReadableCandidatePage = {
  page: PublicPageResource;
  /** Published Markdown source, kept server-side for excerpt evidence only. */
  contentSource: string | null;
};

/**
 * The single permission boundary between internal engine candidates and any
 * public search output. Only published, non-deleted pages of the default
 * space that the actor may read are hydrated; everything else disappears
 * without a trace (no count, no excerpt, no existence signal). Every engine's
 * candidates MUST pass through here before fusion, counting, or projection.
 */
export async function projectReadableCandidatePages(
  ctx: PermCtx,
  pageIds: readonly string[],
): Promise<Map<string, ReadableCandidatePage>> {
  const ids = [...new Set(pageIds)];
  const result = new Map<string, ReadableCandidatePage>();
  if (ids.length === 0) return result;

  const space = await resolveSpace();
  if (!space) return result;
  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) return result;

  const rows = await db
    .select({
      page: schema.pages,
      contentSource: schema.pageRevisions.contentSource,
      author: {
        id: schema.users.id,
        displayName: schema.users.displayName,
        email: schema.users.email,
      },
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
    .where(and(
      eq(schema.pages.spaceId, space.id),
      isNull(schema.pages.deletedAt),
      isNotNull(schema.pages.currentPublishedVersionId),
      inArray(schema.pages.id, ids),
    ));

  for (const row of rows) {
    const { frontmatter } = parsePageFrontmatter(row.contentSource ?? '');
    result.set(row.page.id, {
      contentSource: row.contentSource,
      page: {
        id: row.page.id,
        spaceSlug: space.slug,
        path: row.page.path,
        locale: row.page.locale,
        title: row.page.title,
        frontmatter,
        metadata: row.page.currentPublishedVersionId ? await getRevisionMetadata(row.page.currentPublishedVersionId) : undefined,
        status: 'published',
        author: { id: row.author.id, displayName: row.author.displayName ?? row.author.email },
        createdAt: row.page.createdAt.toISOString(),
        updatedAt: row.page.updatedAt.toISOString(),
        links: links(row.page),
      },
    });
  }
  return result;
}

/** Centers a plain-text excerpt on the first case-insensitive match of `term`. */
export function buildExcerpt(content: string, term: string, windowSize: number): string | null {
  const index = content.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return null;
  const before = Math.floor(windowSize / 2);
  const start = Math.max(0, index - before);
  const end = Math.min(content.length, start + windowSize);
  const excerpt = content.slice(start, end);
  return `${start > 0 ? '…' : ''}${excerpt}${end < content.length ? '…' : ''}`;
}

/** Normalizes whitespace and re-centers an excerpt within the configured window. */
export function compactExcerpt(excerpt: string | null, term: string, windowSize: number, show: boolean): string | null {
  if (!show || !excerpt) return null;
  const normalized = excerpt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= windowSize) return normalized;
  return buildExcerpt(normalized, term, windowSize) ?? `${normalized.slice(0, windowSize)}…`;
}
