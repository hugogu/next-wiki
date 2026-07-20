import { randomUUID } from 'node:crypto';
import { eq, and, isNull, desc, max, count, asc, ilike, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, can, type PermCtx, getActorUserId, pagePermissionOptions, spacePermissionOptions } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { DomainError } from '@/server/errors';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { assertNotMigrating } from '@/server/services/migration';
import { assertPathNotReserved } from '@/server/routes/reserved-paths';
import { pathSchema } from '@next-wiki/shared';
import type {
  AdminPageListFilters,
  AdminPageListItem,
  AdminPageListResult,
  AdminPageSortDirection,
  AdminPageSortKey,
  AdminPageStats,
  LivePage,
  PageSummary,
  EditableView,
  RevisionSummary,
  RevisionView,
  TranslationFreshnessStatus,
} from '@next-wiki/shared';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import {
  readMarkdownFromDatabase,
  readMarkdownWithFallback,
} from '@/server/content-store/read-router';
import { enqueueGitExport } from '@/server/services/git-export';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { getRevisionMetadata, metadataFromInput, metadataFromSource, persistRevisionMetadata } from '@/server/services/page-metadata';
import { parseFrontmatter } from '@/server/metadata/frontmatter';
import { buildPageDescription } from '@/lib/seo';
import { unstable_cache } from 'next/cache';
import { PUBLIC_CONTENT_CACHE_TAG, invalidatePublicContentCache, invalidatePublicLinkPaths, shouldUseDataCache } from '@/server/cache/public-cache';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import { getPageHref } from '@/lib/path';
import { resolveSpace, type SpaceKind } from '@/server/services/spaces';
import { assertNoSwitchInProgress, assertSpaceKindAllowed } from '@/server/services/writing-mode';
import { ensureOkfConceptPath, ensureOkfConformance } from '@/server/services/okf';
import { listLiveLinksForTarget } from '@/server/services/link-pages';

const ADMIN_PAGE_SIZE = 25;
const ADMIN_PAGE_SORTS = new Set<AdminPageSortKey>(['title', 'path', 'author', 'updatedAt', 'createdAt', 'edits']);
const ADMIN_SORT_DIRECTIONS = new Set<AdminPageSortDirection>(['asc', 'desc']);
const HTML_LINK_RE = /<a\b[^>]*\bhref=(["'])(.*?)\1/gi;

function getUserId(ctx: PermCtx): string | null {
  return getActorUserId(ctx);
}

export function actorKindOf(ctx: PermCtx): 'human' | 'machine' {
  return ctx.actor.kind === 'api_key' ? 'machine' : 'human';
}

/** 022 nature forcing: raw-space pages are original, link pages generated. */
function deriveNature(input: {
  spaceKind: SpaceKind;
  kind: 'native' | 'link';
  explicit?: 'original' | 'generated';
  actorKind: 'human' | 'machine';
}): 'original' | 'generated' {
  if (input.spaceKind === 'raw') return 'original';
  if (input.kind === 'link') return 'generated';
  return input.explicit ?? (input.actorKind === 'machine' ? 'generated' : 'original');
}

function leafSlugFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

function assertAdmin(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage pages');
  }
}

function clampPage(value: number | undefined): number {
  if (!value || Number.isNaN(value) || value < 1) return 1;
  return Math.floor(value);
}

function compactFilters(filters: AdminPageListFilters = {}): AdminPageListFilters {
  return {
    ...(filters.keyword?.trim() ? { keyword: filters.keyword.trim() } : {}),
    ...(filters.title?.trim() ? { title: filters.title.trim() } : {}),
    ...(filters.author?.trim() ? { author: filters.author.trim() } : {}),
    ...(filters.path?.trim() ? { path: filters.path.trim() } : {}),
    ...(filters.dateFrom?.trim() ? { dateFrom: filters.dateFrom.trim() } : {}),
    ...(filters.dateTo?.trim() ? { dateTo: filters.dateTo.trim() } : {}),
    ...(filters.space?.trim() ? { space: filters.space.trim() } : {}),
  };
}

function parseDateBoundary(value: string | undefined, boundary: 'start' | 'end'): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function adminPageConditions(spaceId: string, filters: AdminPageListFilters) {
  const dateFrom = parseDateBoundary(filters.dateFrom, 'start');
  const dateTo = parseDateBoundary(filters.dateTo, 'end');
  const keywordCondition = filters.keyword
    ? or(
        ilike(schema.pages.title, `%${filters.keyword}%`),
        ilike(schema.pages.path, `%${filters.keyword}%`),
        ilike(schema.users.displayName, `%${filters.keyword}%`),
        ilike(schema.users.email, `%${filters.keyword}%`),
      )
    : undefined;
  return and(
    eq(schema.pages.spaceId, spaceId),
    isNull(schema.pages.deletedAt),
    // The admin pages list manages source pages; translations are managed from
    // the Translations admin, not here (015).
    isNull(schema.pages.translationGroupId),
    keywordCondition,
    filters.title ? ilike(schema.pages.title, `%${filters.title}%`) : undefined,
    filters.path ? ilike(schema.pages.path, `%${filters.path}%`) : undefined,
    filters.author
      ? or(
          ilike(schema.users.displayName, `%${filters.author}%`),
          ilike(schema.users.email, `%${filters.author}%`),
        )
      : undefined,
    dateFrom ? gte(schema.pages.updatedAt, dateFrom) : undefined,
    dateTo ? lte(schema.pages.updatedAt, dateTo) : undefined,
  );
}

function normalizeLinkTarget(href: string): string | null {
  const withoutAnchor = href.trim().split('#')[0]?.split('?')[0]?.trim() ?? '';
  if (!withoutAnchor || /^[a-z][a-z0-9+.-]*:/i.test(withoutAnchor)) return null;
  return withoutAnchor.replace(/^\/+/, '');
}

function countInternalHtmlLinks(html: string, pageIds: Set<string>, pagePaths: Set<string>): number {
  let total = 0;
  for (const match of html.matchAll(HTML_LINK_RE)) {
    const target = normalizeLinkTarget(match[2] ?? '');
    if (!target) continue;
    if (target.startsWith('api/v1/pages/')) {
      if (pageIds.has(target.slice('api/v1/pages/'.length))) total += 1;
    } else if (pagePaths.has(target)) {
      total += 1;
    }
  }
  return total;
}

function orderExpression(sort: AdminPageSortKey) {
  switch (sort) {
    case 'title':
      return schema.pages.title;
    case 'path':
      return schema.pages.path;
    case 'author':
      return sql`lower(coalesce(${schema.users.displayName}, ${schema.users.email}))`;
    case 'createdAt':
      return schema.pages.createdAt;
    case 'edits':
      return count(schema.pageRevisions.id);
    case 'updatedAt':
    default:
      return schema.pages.updatedAt;
  }
}

/**
 * Pre-generate a revision id and route the raw Markdown to the active content
 * store. The Database backend keeps markdown inline in `content_source`; an
 * external backend (Local/S3) is written external-first (before the DB row is
 * committed) and leaves `content_source` null (plan D1/D9, R11).
 */
/** Resolve legacy externally stored Markdown; new revisions are always authoritative in DB. */
async function readRevisionMarkdown(revision: {
  id: string;
  contentSource: string | null;
  contentHash: string;
}): Promise<string> {
  return readMarkdownWithFallback(revision);
}

export interface ListPublishedOptions {
  /** Cap the number of rows returned. Omit for the full list. */
  limit?: number;
  /** Skip this many rows (for paging). Omit to start at the first row. */
  offset?: number;
  /**
   * `path` (default) keeps the stable alphabetical order used by navigation;
   * `recent` returns the most recently published pages first.
   */
  order?: 'path' | 'recent';
}

export async function listPublished(
  ctx: PermCtx,
  options: ListPublishedOptions = {},
): Promise<PageSummary[]> {
  const space = await resolveSpace();
  if (!space) return [];

  if (!can(ctx, 'read', { kind: 'page_list' }, spacePermissionOptions(space))) {
    return [];
  }

  const query = db
    .select({
      pageId: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      authorId: schema.pages.authorId,
      visibility: schema.pages.visibility,
      authorDisplayName: schema.users.displayName,
      revisionId: schema.pageRevisions.id,
      contentHtml: schema.pageRevisions.contentHtml,
      publishedAt: schema.pageRevisions.publishedAt,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
        // Listings and discovery cover source pages only; translations are
        // surfaced through their language-prefixed URLs (015).
        isNull(schema.pages.translationGroupId),
      ),
    )
    .orderBy(
      options.order === 'recent' ? desc(schema.pageRevisions.publishedAt) : schema.pages.path,
    )
    .$dynamic();

  const limited = options.limit != null ? query.limit(options.limit) : query;
  const paged = options.offset != null ? limited.offset(options.offset) : limited;
  const rows = await paged;
  const userId = getUserId(ctx);
  const readableRows = rows.filter((row) =>
    can(
      ctx,
      'read',
      { kind: 'page', pageId: row.pageId },
      pagePermissionOptions(space, row, { isAuthor: userId ? row.authorId === userId : false }),
    ),
  );
  const revisionIds = readableRows.map((row) => row.revisionId);
  const metadataRows = revisionIds.length
    ? await db
        .select({ revisionId: schema.pageRevisionMetadata.revisionId, summary: schema.pageRevisionMetadata.summary })
        .from(schema.pageRevisionMetadata)
        .where(inArray(schema.pageRevisionMetadata.revisionId, revisionIds))
    : [];
  const summaryByRevisionId = new Map(metadataRows.map((row) => [row.revisionId, row.summary]));

  return readableRows.map((r) => ({
      path: r.path,
      title: r.title,
      authorDisplayName: r.authorDisplayName,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
      description: summaryByRevisionId.get(r.revisionId) || buildPageDescription(r.contentHtml, ''),
    }));
}

/** Total number of published pages in the default space, mirroring `listPublished`'s filter. */
export async function countPublished(ctx: PermCtx): Promise<number> {
  const space = await resolveSpace();
  if (!space) return 0;

  if (!can(ctx, 'read', { kind: 'page_list' }, spacePermissionOptions(space))) {
    return 0;
  }

  const rows = await db
    .select({ id: schema.pages.id, authorId: schema.pages.authorId, visibility: schema.pages.visibility })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
        isNull(schema.pages.translationGroupId),
      ),
    );

  const userId = getUserId(ctx);
  return rows.filter((page) =>
    can(
      ctx,
      'read',
      { kind: 'page', pageId: page.id },
      pagePermissionOptions(space, page, { isAuthor: userId ? page.authorId === userId : false }),
    ),
  ).length;
}

const readCachedHomePageSummary = unstable_cache(
  async () => {
    const ctx = buildAnonymousCtx();
    const [pages, totalPublished] = await Promise.all([
      listPublished(ctx, { limit: 10, order: 'recent' }),
      countPublished(ctx),
    ]);
    return { pages, totalPublished };
  },
  ['public-home-page-summary'],
  { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);

/** Cached anonymous data used exclusively by the public homepage. */
export async function getCachedHomePageSummary() {
  if (shouldUseDataCache()) return readCachedHomePageSummary();
  const ctx = buildAnonymousCtx();
  const [pages, totalPublished] = await Promise.all([
    listPublished(ctx, { limit: 10, order: 'recent' }),
    countPublished(ctx),
  ]);
  return { pages, totalPublished };
}

export async function listAdminPages(
  ctx: PermCtx,
  options: {
    page?: number;
    sort?: string;
    direction?: string;
    filters?: AdminPageListFilters;
  } = {},
): Promise<AdminPageListResult> {
  assertAdmin(ctx);
  // 022: an admin may list any content space (raw/generated only in LLM Wiki
  // mode, enforced by assertSpaceKindAllowed); default wiki when unspecified.
  const space = await resolveSpace(options.filters?.space);
  if (space) await assertSpaceKindAllowed(space.kind);
  if (!space) {
    return {
      items: [],
      totalItems: 0,
      currentPage: 1,
      totalPages: 1,
      pageSize: ADMIN_PAGE_SIZE,
      sort: 'updatedAt',
      direction: 'desc',
      filters: {},
    };
  }

  const filters = compactFilters(options.filters);
  const sort = ADMIN_PAGE_SORTS.has(options.sort as AdminPageSortKey)
    ? (options.sort as AdminPageSortKey)
    : 'updatedAt';
  const direction = ADMIN_SORT_DIRECTIONS.has(options.direction as AdminPageSortDirection)
    ? (options.direction as AdminPageSortDirection)
    : 'desc';
  const currentPage = clampPage(options.page);
  const where = adminPageConditions(space.id, filters);

  const [totalRow] = await db
    .select({ value: count() })
    .from(schema.pages)
    .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
    .where(where);

  const totalItems = totalRow?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const offset = (safePage - 1) * ADMIN_PAGE_SIZE;
  const rows = sort === 'edits'
    ? await db
        .select({
          id: schema.pages.id,
          path: schema.pages.path,
          title: schema.pages.title,
          currentPublishedVersionId: schema.pages.currentPublishedVersionId,
          kind: schema.pages.kind,
          nature: schema.pages.nature,
          authorDisplayName: schema.users.displayName,
          authorEmail: schema.users.email,
          editCount: count(schema.pageRevisions.id),
          createdAt: schema.pages.createdAt,
          updatedAt: schema.pages.updatedAt,
        })
        .from(schema.pages)
        .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
        .leftJoin(schema.pageRevisions, eq(schema.pageRevisions.pageId, schema.pages.id))
        .where(where)
        .groupBy(
          schema.pages.id,
          schema.pages.path,
          schema.pages.title,
          schema.pages.currentPublishedVersionId,
          schema.pages.createdAt,
          schema.pages.updatedAt,
          schema.users.displayName,
          schema.users.email,
        )
        .orderBy(direction === 'asc' ? asc(orderExpression(sort)) : desc(orderExpression(sort)))
        .limit(ADMIN_PAGE_SIZE)
        .offset(offset)
    : await db
        .select({
          id: schema.pages.id,
          path: schema.pages.path,
          title: schema.pages.title,
          currentPublishedVersionId: schema.pages.currentPublishedVersionId,
          kind: schema.pages.kind,
          nature: schema.pages.nature,
          authorDisplayName: schema.users.displayName,
          authorEmail: schema.users.email,
          createdAt: schema.pages.createdAt,
          updatedAt: schema.pages.updatedAt,
        })
        .from(schema.pages)
        .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
        .where(where)
        .orderBy(direction === 'asc' ? asc(orderExpression(sort)) : desc(orderExpression(sort)))
        .limit(ADMIN_PAGE_SIZE)
        .offset(offset);

  const rowPageIds = rows.map((row) => row.id);
  const editCounts = rowPageIds.length && sort !== 'edits'
    ? await db
        .select({ pageId: schema.pageRevisions.pageId, value: count() })
        .from(schema.pageRevisions)
        .where(inArray(schema.pageRevisions.pageId, rowPageIds))
        .groupBy(schema.pageRevisions.pageId)
    : [];
  const editCountByPageId = new Map(editCounts.map((row) => [row.pageId, Number(row.value)]));

  // Tags on each page's latest revision (pageRevisionTags denormalizes the tag
  // name/normalized name, so no join to the tags table is needed).
  const tagRows = rowPageIds.length
    ? await db
        .select({
          pageId: schema.pages.id,
          id: schema.pageRevisionTags.tagId,
          name: schema.pageRevisionTags.tagName,
          normalizedName: schema.pageRevisionTags.normalizedName,
        })
        .from(schema.pages)
        .innerJoin(schema.pageRevisionTags, eq(schema.pageRevisionTags.revisionId, schema.pages.latestVersionId))
        .where(inArray(schema.pages.id, rowPageIds))
    : [];
  const tagsByPageId = new Map<string, AdminPageListItem['tags']>();
  for (const tag of tagRows) {
    const list = tagsByPageId.get(tag.pageId) ?? [];
    list.push({ id: tag.id, name: tag.name, normalizedName: tag.normalizedName });
    tagsByPageId.set(tag.pageId, list);
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      path: row.path,
      title: row.title,
      status: row.currentPublishedVersionId ? 'published' : 'draft',
      authorDisplayName: row.authorDisplayName,
      authorEmail: row.authorEmail,
      editCount: 'editCount' in row ? Number(row.editCount) : editCountByPageId.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      tags: tagsByPageId.get(row.id) ?? [],
      spaceSlug: space.slug,
      kind: row.kind,
      nature: row.nature,
    })),
    totalItems,
    currentPage: safePage,
    totalPages,
    pageSize: ADMIN_PAGE_SIZE,
    sort,
    direction,
    filters,
  };
}

export async function getAdminPageStats(ctx: PermCtx): Promise<AdminPageStats> {
  assertAdmin(ctx);
  const space = await resolveSpace();
  if (!space) return { totalPages: 0, totalEdits: 0, totalPageLinks: 0 };

  const activePagesQuery = db
    .select({
      id: schema.pages.id,
      path: schema.pages.path,
      contentHtml: schema.pageRevisions.contentHtml,
    })
    .from(schema.pages)
    .leftJoin(schema.pageRevisions, eq(schema.pages.latestVersionId, schema.pageRevisions.id))
    .where(and(eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)));

  const editsQuery = db
    .select({ value: count() })
    .from(schema.pageRevisions)
    .innerJoin(schema.pages, eq(schema.pageRevisions.pageId, schema.pages.id))
    .where(and(eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)));

  const [activePages, editRows] = await Promise.all([activePagesQuery, editsQuery]);
  const [editRow] = editRows;
  const pageIds = new Set(activePages.map((page) => page.id));
  const pagePaths = new Set(activePages.map((page) => page.path));

  let totalPageLinks = 0;
  for (const page of activePages) {
    if (page.contentHtml) totalPageLinks += countInternalHtmlLinks(page.contentHtml, pageIds, pagePaths);
  }

  return {
    totalPages: activePages.length,
    totalEdits: editRow?.value ?? 0,
    totalPageLinks,
  };
}

export async function getLive(ctx: PermCtx, path: string): Promise<LivePage | null> {
  const space = await resolveSpace();
  if (!space) return null;

  if (!can(ctx, 'read', { kind: 'page_list' }, spacePermissionOptions(space))) {
    return null;
  }

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      // The bare `/{path}` address always resolves the source/original page.
      // Translated pages share the source path but are only reachable through
      // their language-prefixed `/{locale}/{path}` address (015).
      isNull(schema.pages.translationGroupId),
    ),
  });

  if (!page) return null;

  const userId = getUserId(ctx);
  const isAuthor = userId ? page.authorId === userId : false;

  if (!can(ctx, 'read', { kind: 'page', pageId: page.id }, pagePermissionOptions(space, page, { isAuthor }))) {
    return null;
  }

  if (page.kind === 'link') {
    if (!page.linkTargetPageId) return null;
    const target = await db.query.pages.findFirst({
      where: and(eq(schema.pages.id, page.linkTargetPageId), isNull(schema.pages.deletedAt)),
    });
    if (!target?.currentPublishedVersionId) return null;
    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, target.currentPublishedVersionId),
    });
    if (!revision) return null;
    const author = await db.query.users.findFirst({ where: eq(schema.users.id, page.authorId) });
    const metadata = await getRevisionMetadata(revision.id);
    return {
      pageId: page.id,
      revisionId: revision.id,
      path: page.path,
      title: page.title,
      contentHtml: revision.contentHtml,
      contentHash: revision.contentHash,
      version: revision.versionNumber,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      authorDisplayName: author?.displayName ?? null,
      authorId: page.authorId,
      status: 'published',
      createdAt: page.createdAt.toISOString(),
      metadata,
    };
  }

  if (page.currentPublishedVersionId) {
    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, page.currentPublishedVersionId),
    });
    if (!revision) return null;

    const author = await db.query.users.findFirst({
      where: eq(schema.users.id, page.authorId),
    });
    const metadata = await getRevisionMetadata(revision.id);

    return {
      pageId: page.id,
      revisionId: revision.id,
      path: page.path,
      title: page.title,
      contentHtml: revision.contentHtml,
      contentHash: revision.contentHash,
      version: revision.versionNumber,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      authorDisplayName: author?.displayName ?? null,
      authorId: page.authorId,
      status: 'published',
      createdAt: page.createdAt.toISOString(),
      metadata,
    };
  }

  if (!can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, pagePermissionOptions(space, page, { isAuthor }))) {
    return null;
  }

  if (!page.latestVersionId) return null;

  const draft = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, page.latestVersionId),
  });
  if (!draft) return null;

  const author = await db.query.users.findFirst({
    where: eq(schema.users.id, page.authorId),
  });

  const metadata = await getRevisionMetadata(draft.id);
  return {
    pageId: page.id,
    revisionId: draft.id,
    path: page.path,
    title: page.title,
    contentHtml: draft.contentHtml,
    contentHash: draft.contentHash,
    version: draft.versionNumber,
    publishedAt: null,
    authorDisplayName: author?.displayName ?? null,
    authorId: page.authorId,
    status: 'draft',
    createdAt: page.createdAt.toISOString(),
    metadata,
  };
}

/**
 * Result of resolving a language-prefixed reader address (015):
 * - `page`: a current published translation the reader may see.
 * - `unavailable`: the source is a readable published page but no current
 *   translation exists for this enabled language (localized empty/in-progress
 *   state). Never substitutes another language or the original.
 * - `not_found`: unknown/disabled language, missing source, or an unauthorized
 *   context — revealing nothing about hidden source/translation existence.
 */
export type TranslationReadResult =
  | { kind: 'page'; page: LivePage }
  | { kind: 'unavailable'; sourcePath: string; freshness: TranslationFreshnessStatus | null }
  | { kind: 'not_found' };

/**
 * Resolve `/{locale}/{path}` to its translation. Resolution always begins from
 * the source (unprefixed) path, then the source's translation group and locale;
 * an unrelated same-path locale page can never qualify (content-routing
 * contract). Source and translation read permission are evaluated before any
 * title/revision/HTML is returned.
 */
export async function getLiveTranslation(
  ctx: PermCtx,
  locale: string,
  path: string,
): Promise<TranslationReadResult> {
  const space = await resolveSpace();
  if (!space) return { kind: 'not_found' };

  // Only an enabled, non-retired target language has reader-visible URLs.
  const language = await db.query.translationLanguages.findFirst({
    where: eq(schema.translationLanguages.code, locale),
  });
  if (!language || !language.enabled || language.retiredAt) return { kind: 'not_found' };

  if (!can(ctx, 'read', { kind: 'page_list' }, spacePermissionOptions(space))) {
    return { kind: 'not_found' };
  }

  // Resolve the source/original page by unprefixed path (source pages only).
  const source = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      isNull(schema.pages.translationGroupId),
    ),
  });
  // A hidden or unpublished source reveals nothing — treated as not found.
  if (!source || !source.currentPublishedVersionId) return { kind: 'not_found' };
  const actorUserId = getUserId(ctx);
  if (!can(
    ctx,
    'read',
    { kind: 'page', pageId: source.id },
    pagePermissionOptions(space, source, { isAuthor: actorUserId ? source.authorId === actorUserId : false }),
  )) {
    return { kind: 'not_found' };
  }

  const group = await db.query.translationGroups.findFirst({
    where: eq(schema.translationGroups.sourcePageId, source.id),
  });
  if (!group) return { kind: 'unavailable', sourcePath: source.path, freshness: null };

  const translation = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.translationGroupId, group.id),
      eq(schema.pages.locale, locale),
      isNull(schema.pages.deletedAt),
    ),
  });
  const state = await db.query.pageTranslationStates.findFirst({
    where: and(
      eq(schema.pageTranslationStates.sourcePageId, source.id),
      eq(schema.pageTranslationStates.targetLocale, locale),
    ),
  });
  if (!translation || !translation.currentPublishedVersionId) {
    return { kind: 'unavailable', sourcePath: source.path, freshness: state?.freshnessStatus ?? null };
  }
  if (!can(
    ctx,
    'read',
    { kind: 'page', pageId: translation.id },
    pagePermissionOptions(space, translation, { isAuthor: actorUserId ? translation.authorId === actorUserId : false }),
  )) {
    return { kind: 'not_found' };
  }

  const revision = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, translation.currentPublishedVersionId),
  });
  if (!revision) {
    return { kind: 'unavailable', sourcePath: source.path, freshness: state?.freshnessStatus ?? null };
  }
  const author = await db.query.users.findFirst({ where: eq(schema.users.id, translation.authorId) });
  const metadata = await getRevisionMetadata(revision.id);

  return {
    kind: 'page',
    page: {
      pageId: translation.id,
      revisionId: revision.id,
      // The reader address keeps the shared source path; the language prefix is
      // applied by the route/URL builder.
      path: source.path,
      title: translation.title,
      contentHtml: revision.contentHtml,
      contentHash: revision.contentHash,
      version: revision.versionNumber,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      authorDisplayName: author?.displayName ?? null,
      authorId: translation.authorId,
      status: 'published',
      createdAt: translation.createdAt.toISOString(),
      metadata,
    },
  };
}

/**
 * The enabled target-language codes that have a current published translation
 * for a source path, used to emit hreflang alternates. Returns [] when the path
 * is not a published source page.
 */
export async function getPublishedTranslationLocales(sourcePath: string): Promise<string[]> {
  const space = await resolveSpace();
  if (!space) return [];
  const source = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, sourcePath),
      isNull(schema.pages.deletedAt),
      isNull(schema.pages.translationGroupId),
    ),
  });
  if (!source || !source.currentPublishedVersionId || space.kind !== 'wiki' || source.visibility !== 'public') return [];
  const group = await db.query.translationGroups.findFirst({
    where: eq(schema.translationGroups.sourcePageId, source.id),
  });
  if (!group) return [];
  const rows = await db
    .select({ locale: schema.pages.locale })
    .from(schema.pages)
    .innerJoin(
      schema.translationLanguages,
      eq(schema.translationLanguages.code, schema.pages.locale),
    )
    .where(
      and(
        eq(schema.pages.translationGroupId, group.id),
        isNull(schema.pages.deletedAt),
        sql`${schema.pages.currentPublishedVersionId} is not null`,
        eq(schema.translationLanguages.enabled, true),
        isNull(schema.translationLanguages.retiredAt),
      ),
    );
  return rows.map((r) => r.locale);
}

const readCachedPublicLivePage = unstable_cache(
  async (path: string) => getLive(buildAnonymousCtx(), path),
  ['public-live-page'],
  { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);

const readCachedPublicLiveTranslation = unstable_cache(
  async (locale: string, path: string) => getLiveTranslation(buildAnonymousCtx(), locale, path),
  ['public-live-translation'],
  { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);

const getCachedTranslationLocales = unstable_cache(
  async (sourcePath: string) => getPublishedTranslationLocales(sourcePath),
  ['published-translation-locales'],
  { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);

/** Cached published source page for anonymous readers and metadata generation. */
export async function getCachedPublicLivePage(path: string): Promise<LivePage | null> {
  return shouldUseDataCache()
    ? readCachedPublicLivePage(path)
    : getLive(buildAnonymousCtx(), path);
}

/** Cached published translation lookup for anonymous readers and metadata generation. */
export async function getCachedPublicLiveTranslation(
  locale: string,
  path: string,
): Promise<TranslationReadResult> {
  return shouldUseDataCache()
    ? readCachedPublicLiveTranslation(locale, path)
    : getLiveTranslation(buildAnonymousCtx(), locale, path);
}

export async function getCachedPublishedTranslationLocales(sourcePath: string): Promise<string[]> {
  return shouldUseDataCache()
    ? getCachedTranslationLocales(sourcePath)
    : getPublishedTranslationLocales(sourcePath);
}

export async function getById(ctx: PermCtx, pageId: string): Promise<LivePage | null> {
  const space = await resolveSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.id, pageId),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;
  return getLive(ctx, page.path);
}

/**
 * Fetch a page's *published* revision by id for the public share link, with
 * NO permission gating. This intentionally bypasses `anonymousRead` so a
 * shared link is fully public — but only ever exposes the currently published
 * revision. Drafts, unpublished pages, and soft-deleted pages return null, so
 * nothing pre-publication or private can leak through the share URL.
 */
export async function getPublishedForShare(pageId: string): Promise<LivePage | null> {
  const space = await resolveSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.id, pageId),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page || !page.currentPublishedVersionId || space.kind !== 'wiki' || page.visibility !== 'public') return null;
  return getLive(buildAnonymousCtx(), page.path);
}

/**
 * Returns true if the caller is allowed to create pages in the requested space.
 */
export async function canCreate(ctx: PermCtx, spaceSlug?: string): Promise<boolean> {
  const space = await resolveSpace(spaceSlug);
  if (!space) return false;
  try {
    await assertSpaceKindAllowed(space.kind);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'SPACE_UNAVAILABLE') return false;
    throw error;
  }
  return can(ctx, 'create', { kind: 'page_list' }, spacePermissionOptions(space));
}

export async function remove(ctx: PermCtx, path: string, spaceSlug?: string): Promise<void> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to delete pages');
  }

  const space = await resolveSpace(spaceSlug);
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  await assertSpaceKindAllowed(space.kind);

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      // Path-addressed operations act on the source/original page; translated
      // pages share the path but are managed via the Translations admin (015).
      isNull(schema.pages.translationGroupId),
    ),
  });

  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  if (space.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw entries cannot be deleted');
  if (page.kind === 'link') throw new DomainError('LINK_TARGET_INVALID', 'Link pages must be deleted through the link page service');

  const isAuthor = page.authorId === userId;
  if (!can(ctx, 'delete', { kind: 'page', pageId: page.id }, pagePermissionOptions(space, page, { isAuthor }))) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to delete this page');
  }

  await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    await tx
      .update(schema.pages)
      .set({ deletedAt: new Date() })
      .where(eq(schema.pages.id, page.id));
  });
  const linkedPaths = await listLiveLinksForTarget(page.id);
  invalidatePublicContentCache();
  invalidatePublicLinkPaths(linkedPaths);
  await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(page.id, ctx);
}

export async function create(
  ctx: PermCtx,
  input: { path: string; title: string; contentSource: string; nature?: 'original' | 'generated' },
  spaceSlug?: string,
): Promise<{ pageId: string; versionId: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to create pages');
  }

  const space = await resolveSpace(spaceSlug);
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  await assertSpaceKindAllowed(space.kind);

  if (space.kind === 'raw') {
    throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw entries must be created through the append-only raw entry service');
  }

  if (!can(ctx, 'create', { kind: 'page_list' }, spacePermissionOptions(space))) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to create pages');
  }

  const pathCheck = pathSchema.safeParse(input.path);
  if (!pathCheck.success) {
    throw new DomainError('BAD_REQUEST', pathCheck.error.issues[0]?.message ?? 'Invalid path');
  }
  if (space.kind === 'generated') ensureOkfConceptPath(pathCheck.data);

  assertPathNotReserved(input.path);

  await assertNotMigrating();
  const revisionId = randomUUID();
  const contentSource = space.kind === 'generated'
    ? ensureOkfConformance(input.contentSource, { title: input.title, now: new Date() })
    : input.contentSource;
  const sourceMetadata = metadataFromSource(contentSource, input.title);

  const created = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    const existing = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, input.path),
        isNull(schema.pages.translationGroupId),
      ),
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'A page with this path already exists');
    }

    const { html, hash } = renderMarkdown(contentSource);

    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: space.id,
        slug: leafSlugFromPath(input.path),
        path: input.path,
        title: sourceMetadata.title,
        authorId: userId,
        nature: deriveNature({
          spaceKind: space.kind,
          kind: 'native',
          explicit: input.nature,
          actorKind: actorKindOf(ctx),
        }),
        visibility: space.kind === 'generated' ? 'restricted' : 'public',
        writeMetadataToFrontmatter: parseFrontmatter(contentSource).hasValidFrontmatter,
      })
      .returning();

    if (!page) throw new Error('Failed to create page');

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
        actorKind: actorKindOf(ctx),
      })
      .returning();

    if (!revision) throw new Error('Failed to create revision');

    await persistRevisionMetadata(tx, {
      revisionId: revision.id,
      spaceId: space.id,
      source: contentSource,
      fallbackTitle: sourceMetadata.title,
    });

    await syncRevisionAssetRefs(tx, revision.id, contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);

    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id })
      .where(eq(schema.pages.id, page.id));

    return { pageId: page.id, versionId: revision.id };
  });
  await kickReplication();
  return created;
}

export async function newDraft(
  ctx: PermCtx,
  path: string,
  input: {
    title: string;
    contentSource: string;
    baseRevisionId?: string;
    baseContentHash?: string;
    metadata?: { date: string | null; summary: string | null; tags: string[] };
    writeMetadataToFrontmatter?: boolean;
  },
  spaceSlug?: string,
): Promise<{ versionId: string; versionNumber: number }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to edit pages');
  }

  const space = await resolveSpace(spaceSlug);
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  await assertSpaceKindAllowed(space.kind);
  if (space.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw entries cannot be edited');

  await assertNotMigrating();
  const revisionId = randomUUID();
  const contentSource = space.kind === 'generated'
    ? ensureOkfConformance(input.contentSource, { title: input.title, now: new Date() })
    : input.contentSource;
  // Persist the page's frontmatter-embedding preference. Editors pass it
  // explicitly; other writers (API/AI) leave it undefined, so derive it from
  // whether the submitted content actually embeds a frontmatter block.
  const writeMetadataToFrontmatter =
    input.writeMetadataToFrontmatter ?? parseFrontmatter(contentSource).hasValidFrontmatter;
  const sourceMetadata = input.metadata
    ? metadataFromInput(input.title, input.metadata)
    : metadataFromSource(contentSource, input.title);

  const created = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, path),
        isNull(schema.pages.deletedAt),
      ),
    });

    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (page.kind === 'link') throw new DomainError('LINK_TARGET_INVALID', 'Link pages cannot have content drafts');
    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id }, pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }))) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
    }

    if (input.baseRevisionId && page.latestVersionId !== input.baseRevisionId) {
      throw new DomainError('STALE_REVISION', 'The page has changed since the supplied base revision');
    }

    if (input.baseContentHash && page.latestVersionId) {
      const latest = await tx.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, page.latestVersionId),
      });
      if (latest && latest.contentHash !== input.baseContentHash) {
        throw new DomainError('STALE_REVISION', 'The page has changed since the supplied content hash');
      }
    }

    const maxResult = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, page.id));

    const nextVersion = (maxResult[0]?.value ?? 0) + 1;
    const { html, hash } = renderMarkdown(contentSource);

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: nextVersion,
        contentType: 'text/markdown',
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
        actorKind: actorKindOf(ctx),
      })
      .returning();

    if (!revision) throw new Error('Failed to create revision');

    await persistRevisionMetadata(tx, {
      revisionId: revision.id,
      spaceId: space.id,
      source: contentSource,
      fallbackTitle: sourceMetadata.title,
      metadata: input.metadata ? sourceMetadata : undefined,
    });

    await syncRevisionAssetRefs(tx, revision.id, contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);

    await tx
      .update(schema.pages)
      .set({
        title: sourceMetadata.title,
        latestVersionId: revision.id,
        writeMetadataToFrontmatter,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return { versionId: revision.id, versionNumber: revision.versionNumber };
  });
  await kickReplication();
  return created;
}

export async function updateProperties(
  ctx: PermCtx,
  currentPath: string,
  input: { path?: string; title?: string; baseRevisionId?: string },
  spaceSlug?: string,
): Promise<{ pageId: string; newPath: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to edit page properties');
  }

  const space = await resolveSpace(spaceSlug);
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  await assertSpaceKindAllowed(space.kind);
  if (space.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw entries cannot be changed');

  if (!input.path && !input.title) {
    throw new DomainError('BAD_REQUEST', 'Provide path or title');
  }

  if (input.path) {
    const pathCheck = pathSchema.safeParse(input.path);
    if (!pathCheck.success) {
      throw new DomainError('BAD_REQUEST', pathCheck.error.issues[0]?.message ?? 'Invalid path');
    }
    assertPathNotReserved(input.path);
    if (space.kind === 'generated') ensureOkfConceptPath(pathCheck.data);
  }

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, currentPath),
        isNull(schema.pages.deletedAt),
        isNull(schema.pages.translationGroupId),
      ),
    });

    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (page.kind === 'link' && (ctx.actor.kind === 'anonymous' || ctx.actor.role !== 'admin')) {
      throw new DomainError('FORBIDDEN', 'Only Admins can manage link pages');
    }
    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id }, pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }))) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
    }

    if (input.baseRevisionId && page.latestVersionId !== input.baseRevisionId) {
      throw new DomainError('STALE_REVISION', 'The page has changed since the supplied base revision');
    }

    const nextPath = input.path ?? currentPath;
    if (nextPath !== currentPath) {
      const existing = await tx.query.pages.findFirst({
        where: and(
          eq(schema.pages.spaceId, space.id),
          eq(schema.pages.path, nextPath),
          isNull(schema.pages.translationGroupId),
        ),
      });
      if (existing) {
        throw new DomainError('CONFLICT', 'A page with this path already exists');
      }
    }

    await tx
      .update(schema.pages)
      .set({
        path: nextPath,
        slug: leafSlugFromPath(nextPath),
        ...(input.title ? { title: input.title } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return {
      pageId: page.id,
      newPath: nextPath,
      isPublished: page.currentPublishedVersionId !== null,
    };
  });
  const linkedPaths = await listLiveLinksForTarget(result.pageId);
  invalidatePublicContentCache();
  invalidatePublicLinkPaths([...linkedPaths, ...(result.isPublished ? [currentPath, result.newPath] : [])]);
  if (result.isPublished) await enqueuePublicPageWarmup(getPageHref(result.newPath));
  if (result.newPath !== currentPath) await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(result.pageId, ctx);
  return result;
}

/**
 * Move a native page to another content space (Admin, LLM Wiki mode), adapting
 * the content format automatically: moving into the generated space injects OKF
 * frontmatter when absent (as a new machine-authored revision) and validates the
 * concept path; moving into the wiki space needs no transform. Raw is not a valid
 * target (append-only evidence). Reclassifies `nature`/`visibility` for the
 * destination — the primary use is filing AI-generated wiki imports as generated.
 */
export async function moveToSpace(
  ctx: PermCtx,
  pageId: string,
  input: { targetSpace: 'default' | 'generated'; visibility?: 'public' | 'restricted' },
): Promise<{ pageId: string; targetSpace: string; path: string }> {
  assertAdmin(ctx);
  const userId = getUserId(ctx)!;

  const target = await resolveSpace(input.targetSpace);
  if (!target) throw new DomainError('NOT_FOUND', 'Target space not found');
  await assertSpaceKindAllowed(target.kind);
  if (target.kind === 'raw') {
    throw new DomainError('PAGE_SPACE_MOVE_INVALID', 'Pages cannot be moved into the append-only raw space');
  }

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    const page = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt), isNull(schema.pages.translationGroupId)),
    });
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

    const source = await tx.query.spaces.findFirst({ where: eq(schema.spaces.id, page.spaceId) });
    if (!source) throw new DomainError('NOT_FOUND', 'Source space not found');
    await assertSpaceKindAllowed(source.kind);

    if (source.id === target.id) throw new DomainError('PAGE_SPACE_MOVE_INVALID', 'The page is already in this space');
    if (source.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw entries cannot be moved between spaces');
    if (page.kind === 'link') throw new DomainError('PAGE_SPACE_MOVE_INVALID', 'Link pages cannot be moved between spaces');
    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id }, pagePermissionOptions(source, page, { isAuthor: page.authorId === userId }))) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to move this page');
    }

    // Moving a generated page that is published as a wiki link would strand the
    // link; the admin must remove the link first.
    if (source.kind === 'generated') {
      const links = await listLiveLinksForTarget(page.id);
      if (links.length > 0) {
        throw new DomainError('PAGE_SPACE_MOVE_INVALID', 'This page is published through a wiki link; remove the link before moving it');
      }
    }

    if (target.kind === 'generated') ensureOkfConceptPath(page.path);

    const conflict = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, target.id),
        eq(schema.pages.path, page.path),
        eq(schema.pages.locale, page.locale),
        isNull(schema.pages.translationGroupId),
      ),
    });
    if (conflict) throw new DomainError('PAGE_PATH_CONFLICT', 'A page with this path already exists in the target space');

    // Content-format adaptation: only the generated space requires OKF; inject it
    // when the live/latest content lacks it, as a new revision preserving status.
    const primaryRevId = page.currentPublishedVersionId ?? page.latestVersionId;
    let movedRevisionId: string | null = null;
    if (target.kind === 'generated' && primaryRevId) {
      const current = await tx.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, primaryRevId) });
      if (current) {
        const original = await readMarkdownWithFallback(current);
        const conformant = ensureOkfConformance(original, { title: page.title, now: new Date() });
        if (conformant !== original) {
          const revisionId = randomUUID();
          const { html, hash } = renderMarkdown(conformant);
          const versionRows = await tx
            .select({ value: max(schema.pageRevisions.versionNumber) })
            .from(schema.pageRevisions)
            .where(eq(schema.pageRevisions.pageId, page.id));
          const [revision] = await tx
            .insert(schema.pageRevisions)
            .values({
              id: revisionId,
              pageId: page.id,
              versionNumber: (versionRows[0]?.value ?? 0) + 1,
              locale: page.locale,
              contentType: 'text/markdown',
              contentSource: conformant,
              contentHtml: html,
              contentHash: hash,
              authorId: userId,
              status: current.status,
              actorKind: 'machine',
              publishedAt: current.status === 'published' ? new Date() : null,
            })
            .returning();
          if (!revision) throw new Error('Failed to write OKF-conformant revision');
          await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: target.id, source: conformant, fallbackTitle: page.title });
          await syncRevisionAssetRefs(tx, revision.id, conformant);
          await addReplicationTasks(tx, 'markdown', revision.id, hash);
          movedRevisionId = revision.id;
        }
      }
    }

    const visibility = input.visibility ?? (target.kind === 'generated' ? 'restricted' : 'public');
    await tx
      .update(schema.pages)
      .set({
        spaceId: target.id,
        // Reclassify to the destination's nature when moving into generated;
        // keep the existing provenance when moving back to the wiki.
        nature: target.kind === 'generated' ? 'generated' : page.nature,
        visibility,
        ...(movedRevisionId && primaryRevId === page.latestVersionId ? { latestVersionId: movedRevisionId } : {}),
        ...(movedRevisionId && primaryRevId === page.currentPublishedVersionId ? { currentPublishedVersionId: movedRevisionId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return { pageId: page.id, path: page.path, isPublished: page.currentPublishedVersionId !== null || movedRevisionId !== null };
  });

  invalidatePublicContentCache();
  // The public path flips visibility on a move to/from the wiki space; revalidate
  // it so anonymous ISR reflects the new state either way.
  if (result.isPublished) invalidatePublicLinkPaths([result.path]);
  await reconcilePageAcrossIndexes(result.pageId, ctx);
  await enqueueGitExport('publish');
  await kickReplication();
  return { pageId: result.pageId, targetSpace: target.slug, path: result.path };
}

export async function getForEdit(ctx: PermCtx, path: string, spaceSlug?: string): Promise<EditableView | null> {
  const userId = getUserId(ctx);
  const space = await resolveSpace(spaceSlug);
  if (!space) return null;
  try {
    await assertSpaceKindAllowed(space.kind);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'SPACE_UNAVAILABLE') return null;
    throw error;
  }

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      // Path-addressed operations act on the source/original page; translated
      // pages share the path but are managed via the Translations admin (015).
      isNull(schema.pages.translationGroupId),
    ),
  });

  if (!page) return null;

  const isAuthor = userId ? page.authorId === userId : false;
  if (!can(ctx, 'edit', { kind: 'page', pageId: page.id }, pagePermissionOptions(space, page, { isAuthor }))) {
    return null;
  }

  const revision = page.latestVersionId
    ? await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, page.latestVersionId),
      })
    : null;

  if (!revision) return null;
  const metadata = await getRevisionMetadata(revision.id);

  const isRevisionAuthor = userId ? revision.authorId === userId : false;
  const canPublish = can(
    ctx,
    'publish',
    { kind: 'revision', pageId: page.id, version: revision.versionNumber },
    pagePermissionOptions(space, page, { isAuthor: isRevisionAuthor }),
  );
  const canDelete = can(ctx, 'delete', { kind: 'page', pageId: page.id }, pagePermissionOptions(space, page, { isAuthor }));

  return {
    pageId: page.id,
    revisionId: revision.id,
    path: page.path,
    title: page.title,
    // Editing reads the authoritative source directly: blocking the page load
    // on a remote replica (e.g. S3) is not worth it for the small markdown body.
    contentSource: await readMarkdownFromDatabase(revision),
    latestVersion: revision.versionNumber,
    status: revision.status,
    canPublish,
    canDelete,
    writeMetadataToFrontmatter: page.writeMetadataToFrontmatter,
    metadata,
  };
}

export async function getHistory(ctx: PermCtx, path: string): Promise<RevisionSummary[]> {
  const userId = getUserId(ctx);
  const space = await resolveSpace();
  if (!space) return [];

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      // Path-addressed operations act on the source/original page; translated
      // pages share the path but are managed via the Translations admin (015).
      isNull(schema.pages.translationGroupId),
    ),
  });

  if (!page) return [];

  const isAuthor = userId ? page.authorId === userId : false;
  const canSeeDrafts = can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, pagePermissionOptions(space, page, { isAuthor }));

  if (!userId) {
    return [];
  }

  const rows = await db
    .select({
      version: schema.pageRevisions.versionNumber,
      status: schema.pageRevisions.status,
      authorId: schema.pageRevisions.authorId,
      authorDisplayName: schema.users.displayName,
      createdAt: schema.pageRevisions.createdAt,
      contentHash: schema.pageRevisions.contentHash,
    })
    .from(schema.pageRevisions)
    .innerJoin(schema.users, eq(schema.pageRevisions.authorId, schema.users.id))
    .where(eq(schema.pageRevisions.pageId, page.id))
    .orderBy(desc(schema.pageRevisions.versionNumber));

  return rows
    .filter((r) => canSeeDrafts || r.status === 'published')
    .map((r) => {
      const isAuthor = userId ? r.authorId === userId : false;
      const canPublish = can(
        ctx,
        'publish',
        { kind: 'revision', pageId: page.id, version: r.version },
        pagePermissionOptions(space, page, { isAuthor }),
      );

      return {
        version: r.version,
        status: r.status,
        authorDisplayName: r.authorDisplayName,
        createdAt: r.createdAt.toISOString(),
        contentHash: r.contentHash,
        canPublish,
      };
    });
}

export async function getRevision(
  ctx: PermCtx,
  path: string,
  version: number,
): Promise<RevisionView | null> {
  const userId = getUserId(ctx);
  const space = await resolveSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      // Path-addressed operations act on the source/original page; translated
      // pages share the path but are managed via the Translations admin (015).
      isNull(schema.pages.translationGroupId),
    ),
  });

  if (!page) return null;

  const revision = await db.query.pageRevisions.findFirst({
    where: and(
      eq(schema.pageRevisions.pageId, page.id),
      eq(schema.pageRevisions.versionNumber, version),
    ),
  });

  if (!revision) return null;

  const isAuthor = userId ? revision.authorId === userId : false;
  if (revision.status === 'draft' && !can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version }, pagePermissionOptions(space, page, { isAuthor }))) {
    return null;
  }

  const author = await db.query.users.findFirst({
    where: eq(schema.users.id, revision.authorId),
  });

  return {
    version: revision.versionNumber,
    status: revision.status,
    contentHtml: revision.contentHtml,
    contentSource: await readRevisionMarkdown(revision),
    authorDisplayName: author?.displayName ?? null,
    createdAt: revision.createdAt.toISOString(),
  };
}
