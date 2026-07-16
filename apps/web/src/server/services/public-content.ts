import { randomUUID } from 'node:crypto';
import { and, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lte, max, or, like, type SQL } from 'drizzle-orm';
import { stringify as stringifyYaml } from 'yaml';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type {
  PublicAssetResource,
  PublicBatchItemResult,
  PublicDanglingLink,
  PublicDraftCreateInput,
  PublicExternalLink,
  PublicNeighborNode,
  PublicNeighborVia,
  PublicNeighborhoodResponse,
  PublicOutboundLink,
  PublicOutboundLinksResponse,
  PublicPageBatchDeleteInput,
  PublicPageBatchDeleteResult,
  PublicPageBatchUpdateInput,
  PublicPageBatchUpdateItemInput,
  PublicPageBatchUpdateResult,
  PublicPageCreateInput,
  PublicPageInclude,
  PublicPageListQuery,
  PublicPageListResponse,
  PublicPagePropertiesInput,
  PublicPageMetadataInput,
  PublicPageResource,
  PublicPageSearchQuery,
  PublicPageSearchResponse,
  HybridPageSearchResponse,
  HybridSearchQueryInput,
  PublicPageTreeNode,
  PublicPageTreeQuery,
  PublicPageTreeResponse,
  PublicPublicationInput,
  PublicRevisionListQuery,
  PublicRevisionListResponse,
  PublicRevisionResource,
} from '@next-wiki/shared';
import { decodePublicCursor, nextPublicCursor } from '@/server/api/public-pagination';
import { buildAnonymousCtx, can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { mapPublicDomainErrorCode } from '@/server/api/public-errors';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { renderMarkdown } from '@/server/pipeline';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { enqueueGitExport } from '@/server/services/git-export';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { parsePageFrontmatter, matchesFrontmatterFilters, type FrontmatterFilters } from '@/server/transfers/frontmatter';
import { findFrontmatterRelatedPages, findMarkdownLinks } from '@/server/transfers/markdown-links';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import * as contentAssets from '@/server/services/content-assets';
import * as searchAnalytics from '@/server/services/search-analytics';
import { getSearchSettings } from '@/server/services/search-settings';
import { runCoordinatedSearch } from '@/server/services/search/coordinator';
import type { CapabilitySnapshot } from '@/server/services/search/types';
import { getRevisionMetadata, metadataFromSource, patchMetadata, persistRevisionMetadata } from '@/server/services/page-metadata';
import { normalizeTagName } from '@/server/metadata/frontmatter';
import { unstable_cache } from 'next/cache';
import { PUBLIC_CONTENT_CACHE_TAG, shouldUseDataCache } from '@/server/cache/public-cache';

const DEFAULT_SPACE_SLUG = 'default';

type PageRow = typeof schema.pages.$inferSelect;
type RevisionRow = typeof schema.pageRevisions.$inferSelect;

async function getDefaultSpace() {
  return db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Returns a copy of a page resource with contentSource omitted (list/search shape). */
function stripPageContent(page: PublicPageResource): PublicPageResource {
  const copy = { ...page };
  delete copy.contentSource;
  return copy;
}

/** Centers a plain-text excerpt on the first case-insensitive match of `term`. */
function buildExcerpt(content: string, term: string, windowSize: number): string | null {
  const index = content.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return null;
  const before = Math.floor(windowSize / 2);
  const start = Math.max(0, index - before);
  const end = Math.min(content.length, start + windowSize);
  const excerpt = content.slice(start, end);
  return `${start > 0 ? '…' : ''}${excerpt}${end < content.length ? '…' : ''}`;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}

/**
 * Heuristic relevance score in (0, 1], since search has no real full-text index
 * (plain ILIKE substring matching). Tiered so path matches always outrank title
 * matches, which always outrank content matches; within a tier, an exact
 * path/title match or more frequent content mentions score higher.
 */
function scoreSearchMatch(matchType: 'path' | 'title' | 'content', page: PublicPageResource, term: string): number {
  const q = term.toLowerCase();
  if (matchType === 'path') return page.path.toLowerCase() === q ? 1 : 0.95;
  if (matchType === 'title') return page.title.toLowerCase() === q ? 0.9 : 0.8;
  const occurrences = page.contentSource ? countOccurrences(page.contentSource.toLowerCase(), q) : 0;
  return Math.min(0.3 + occurrences * 0.05, 0.7);
}

function links(page: PageRow) {
  return {
    self: `/api/v1/pages/${page.id}`,
    byPath: `/api/v1/pages?path=${encodePath(page.path)}`,
    revisions: `/api/v1/pages/${page.id}/revisions`,
    drafts: `/api/v1/pages/${page.id}/drafts`,
  };
}

function minimalDeletedPageResource(space: { slug: string }, page: PageRow): PublicPageResource {
  return {
    id: page.id,
    spaceSlug: space.slug,
    path: page.path,
    locale: page.locale,
    title: page.title,
    status: 'deleted',
    author: { id: null, displayName: null },
    frontmatter: null,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    links: links(page),
  };
}

async function author(id: string | null) {
  if (!id) return { id: null, displayName: null };
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  return { id, displayName: row?.displayName ?? null };
}

async function revisionSummary(ctx: PermCtx, page: PageRow, revision: RevisionRow | null) {
  if (!revision) return null;
  const userId = getActorUserId(ctx);
  const isAuthor = userId ? revision.authorId === userId : false;
  return {
    id: revision.id,
    pageId: page.id,
    version: revision.versionNumber,
    status: revision.status,
    contentType: revision.contentType,
    contentHash: revision.contentHash,
    author: await author(revision.authorId),
    createdAt: revision.createdAt.toISOString(),
    publishedAt: revision.publishedAt?.toISOString() ?? null,
    canPublish: can(ctx, 'publish', { kind: 'revision', pageId: page.id, version: revision.versionNumber }, { isAuthor }),
  };
}

/**
 * Every /api/v1 response is a plain JSON body with no conditional-request support
 * (no ETag/Cache-Control validators), so there is no HTTP caching layer that could
 * ever turn a repeat request into a cheap 304 and make an S3 read worth its network
 * round trip. Always read content straight from the DB row already in hand (every
 * write stores content_source synchronously, see pages.ts create/newDraft). The
 * S3-preferred replica exists for endpoints that DO support 304 (e.g. asset content
 * serving), not this API.
 */
type VisiblePageOptions = {
  includeContent: boolean;
  include: readonly PublicPageInclude[];
};

const DEFAULT_VISIBLE_PAGE_OPTIONS: VisiblePageOptions = {
  includeContent: true,
  include: [],
};

async function visiblePageResource(
  ctx: PermCtx,
  space: { slug: string; anonymousRead: boolean; defaultLocale: string },
  page: PageRow,
  options: VisiblePageOptions = DEFAULT_VISIBLE_PAGE_OPTIONS,
): Promise<PublicPageResource | null> {
  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return null;
  }

  const userId = getActorUserId(ctx);
  const isPageAuthor = userId ? page.authorId === userId : false;
  const canSeeDraft = can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, { isAuthor: isPageAuthor });

  const [publishedRow, latestRow] = await Promise.all([
    page.currentPublishedVersionId
      ? db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.currentPublishedVersionId) })
      : Promise.resolve(undefined),
    page.latestVersionId
      ? db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.latestVersionId) })
      : Promise.resolve(undefined),
  ]);
  const published = publishedRow ?? null;
  const latest = latestRow ?? null;

  if (!published && !canSeeDraft) return null;

  const visibleLatest = (latest && (latest.status === 'published' || canSeeDraft) ? latest : published) ?? null;
  const current = visibleLatest ?? published;
  if (!current) return null;

  const wantsLatest = options.include.includes('latestRevision');
  const wantsPublished = options.include.includes('publishedRevision');

  // Content is always read server-side so `frontmatter` (FR-011) can be
  // derived on every response; `options.includeContent` only controls
  // whether the raw Markdown is included in the returned shape.
  const [content, pageAuthor, latestRevision, publishedRevision] = await Promise.all([
    readMarkdownFromDatabase(current),
    author(page.authorId),
    wantsLatest ? revisionSummary(ctx, page, visibleLatest) : Promise.resolve(undefined),
    wantsPublished ? revisionSummary(ctx, page, published) : Promise.resolve(undefined),
  ]);
  const { frontmatter } = parsePageFrontmatter(content ?? '');
  const metadata = await getRevisionMetadata(current.id);

  return {
    id: page.id,
    spaceSlug: space.slug,
    path: page.path,
    locale: page.locale,
    title: page.title,
    contentSource: options.includeContent ? content : undefined,
    frontmatter,
    metadata,
    status: published ? 'published' : 'draft',
    author: pageAuthor,
    latestRevision,
    publishedRevision,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    links: links(page),
  };
}

async function getVisiblePage(ctx: PermCtx, predicate: SQL, include: readonly PublicPageInclude[] = []): Promise<PublicPageResource | null> {
  const space = await getDefaultSpace();
  if (!space) return null;
  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      predicate,
      isNull(schema.pages.deletedAt),
    ),
  });
  if (!page) return null;
  return visiblePageResource(ctx, space, page, { ...DEFAULT_VISIBLE_PAGE_OPTIONS, include });
}

async function getPageRowById(pageId: string): Promise<PageRow | null> {
  const space = await getDefaultSpace();
  if (!space) return null;
  return (await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.id, pageId),
      isNull(schema.pages.deletedAt),
    ),
  })) ?? null;
}

type VisibleRevisionOptions = {
  includeContent: boolean;
};

const DEFAULT_VISIBLE_REVISION_OPTIONS: VisibleRevisionOptions = { includeContent: true };

async function visibleRevisionResource(
  ctx: PermCtx,
  page: PageRow,
  revision: RevisionRow,
  options: VisibleRevisionOptions = DEFAULT_VISIBLE_REVISION_OPTIONS,
): Promise<PublicRevisionResource | null> {
  const userId = getActorUserId(ctx);
  const isAuthor = userId ? revision.authorId === userId : false;
  if (revision.status === 'draft' && !can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: revision.versionNumber }, { isAuthor })) {
    return null;
  }
  const [summary, content] = await Promise.all([
    revisionSummary(ctx, page, revision),
    readMarkdownFromDatabase(revision),
  ]);
  const { frontmatter } = parsePageFrontmatter(content ?? '');
  const metadata = await getRevisionMetadata(revision.id);
  return { ...summary!, contentSource: options.includeContent ? content : undefined, frontmatter, metadata };
}

function extractFrontmatterFilters(query: {
  'filter[status]'?: string[];
  'filter[owner]'?: string[];
  'filter[has_frontmatter]'?: boolean;
}): FrontmatterFilters | undefined {
  const filters: FrontmatterFilters = {
    status: query['filter[status]'],
    owner: query['filter[owner]'],
    hasFrontmatter: query['filter[has_frontmatter]'],
  };
  const hasAnyFilter = filters.status || filters.owner || filters.hasFrontmatter !== undefined;
  return hasAnyFilter ? filters : undefined;
}

function extractTagFilters(query: { 'filter[tag]'?: string[] }): string[] | undefined {
  const filters = [...new Set((query['filter[tag]'] ?? []).map(normalizeTagName).filter(Boolean))];
  return filters.length > 0 ? filters : undefined;
}

function matchesTagFilters(page: PublicPageResource, filters: readonly string[]): boolean {
  return page.metadata?.tags.some((tag) => filters.includes(tag.normalizedName)) ?? false;
}

type ListPagesQuery = {
  status: 'published' | 'draft' | 'all' | 'deleted';
  q?: string;
  path?: string;
  pathPrefix?: string;
  limit: number;
  cursor?: string;
  order: 'path' | 'recent';
  include: readonly PublicPageInclude[];
  createdStart?: Date;
  createdEnd?: Date;
  updatedStart?: Date;
  updatedEnd?: Date;
  tagFilters?: string[];
  frontmatterFilters?: FrontmatterFilters;
};

/**
 * Shared row-fetch/permission-filter logic for both the list endpoint and search
 * (search reuses this rather than the public listPages so it can read contentSource
 * for match/excerpt computation before the public list shape strips it).
 */
async function listPagesInternal(
  ctx: PermCtx,
  query: ListPagesQuery,
  options: { includeContent: boolean },
): Promise<PublicPageListResponse> {
  const space = await getDefaultSpace();
  if (!space) return { items: [], nextCursor: null };

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return { items: [], nextCursor: null };
  }

  if (query.path) {
    const page = await getPageByPath(ctx, query.path, query.include);
    return { items: page ? [page] : [], nextCursor: null };
  }

  const canSeeDeleted = query.status === 'deleted' || query.status === 'all'
    ? can(ctx, 'delete', { kind: 'page_list' })
    : false;

  const cursor = decodePublicCursor(query.cursor);
  const conditions: SQL[] = [eq(schema.pages.spaceId, space.id)];
  if (query.status === 'deleted') {
    conditions.push(isNotNull(schema.pages.deletedAt));
  } else if (query.status !== 'all') {
    conditions.push(isNull(schema.pages.deletedAt));
  }
  if (query.pathPrefix) {
    conditions.push(
      or(
        eq(schema.pages.path, query.pathPrefix),
        like(schema.pages.path, `${query.pathPrefix}/%`),
      )!,
    );
  }
  if (query.status === 'published') {
    conditions.push(isNotNull(schema.pages.currentPublishedVersionId));
  }
  if (query.createdStart) conditions.push(gte(schema.pages.createdAt, query.createdStart));
  if (query.createdEnd) conditions.push(lte(schema.pages.createdAt, query.createdEnd));
  if (query.updatedStart) conditions.push(gte(schema.pages.updatedAt, query.updatedStart));
  if (query.updatedEnd) conditions.push(lte(schema.pages.updatedAt, query.updatedEnd));
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(
      or(
        ilike(schema.pages.path, pattern),
        ilike(schema.pages.title, pattern),
        ilike(schema.pageRevisions.contentSource, pattern),
      )!,
    );
  }
  if (query.tagFilters) {
    const actorUserId = getActorUserId(ctx);
    const canSeeEveryDraft = can(
      ctx,
      'read_draft',
      { kind: 'revision', pageId: '00000000-0000-0000-0000-000000000000', version: 0 },
      { isAuthor: false },
    );
    const canSeeOwnDraft = actorUserId
      ? can(
          ctx,
          'read_draft',
          { kind: 'revision', pageId: '00000000-0000-0000-0000-000000000000', version: 0 },
          { isAuthor: true },
        )
      : false;
    if (canSeeEveryDraft) {
      conditions.push(exists(
        db
          .select({ revisionId: schema.pageRevisionTags.revisionId })
          .from(schema.pageRevisionTags)
          .where(and(
            inArray(schema.pageRevisionTags.normalizedName, query.tagFilters),
            eq(schema.pageRevisionTags.revisionId, schema.pages.latestVersionId),
          )),
      ));
    } else {
      conditions.push(exists(
        db
          .select({ revisionId: schema.pageRevisionTags.revisionId })
          .from(schema.pageRevisionTags)
          .where(and(
            inArray(schema.pageRevisionTags.normalizedName, query.tagFilters),
            or(
              eq(schema.pageRevisionTags.revisionId, schema.pages.currentPublishedVersionId),
              ...(actorUserId && canSeeOwnDraft
                ? [and(
                    eq(schema.pages.authorId, actorUserId),
                    eq(schema.pageRevisionTags.revisionId, schema.pages.latestVersionId),
                  )!]
                : []),
            ),
          )),
      ));
    }
  }

  const rows = await db
    .select({ page: schema.pages })
    .from(schema.pages)
    .leftJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(and(...conditions))
    .orderBy(query.order === 'recent' ? desc(schema.pageRevisions.publishedAt) : schema.pages.path)
    .limit(query.limit + 1)
    .offset(cursor.offset);

  // Resolve the whole row window concurrently — these are independent per-row reads.
  const resolved = await Promise.all(
    rows.map(({ page }) => {
      if (page.deletedAt) {
        return canSeeDeleted ? minimalDeletedPageResource(space, page) : Promise.resolve(null);
      }
      return visiblePageResource(ctx, space, page, {
        includeContent: options.includeContent,
        include: query.include,
      });
    }),
  );

  const items: PublicPageResource[] = [];
  for (const item of resolved) {
    if (!item) continue;
    if (query.status === 'draft' && item.status !== 'draft') continue;
    if (query.status === 'deleted' && item.status !== 'deleted') continue;
    if (query.status === 'published' && item.status !== 'published') continue;
    if (query.q) {
      // The SQL predicate above already matches path/title/content; this re-check
      // covers rows whose q-match relies on locale/permission-adjusted content.
      const q = query.q.toLowerCase();
      if (!item.path.toLowerCase().includes(q) && !item.title.toLowerCase().includes(q) && !item.contentSource?.toLowerCase().includes(q)) {
        continue;
      }
    }
    if (query.frontmatterFilters && !matchesFrontmatterFilters(item.frontmatter, query.frontmatterFilters)) {
      continue;
    }
    if (query.tagFilters && !matchesTagFilters(item, query.tagFilters)) continue;
    items.push(item);
    if (items.length >= query.limit) break;
  }

  return {
    items,
    nextCursor: rows.length > query.limit ? nextPublicCursor({ offset: cursor.offset, limit: query.limit, itemCount: query.limit }) : null,
  };
}

export async function listPages(ctx: PermCtx, query: PublicPageListQuery): Promise<PublicPageListResponse> {
  // The list endpoint never returns contentSource; only fetch it when a q filter
  // needs it for the JS-level re-check above.
  const result = await listPagesInternal(
    ctx,
    { ...query, tagFilters: extractTagFilters(query), frontmatterFilters: extractFrontmatterFilters(query) },
    { includeContent: Boolean(query.q) },
  );
  // The `path` filter is a single-page lookup wearing the list endpoint's clothes
  // (at most one item, no browsing) — keep its contentSource like GET /pages/{id}.
  if (query.path) return result;
  return { items: result.items.map(stripPageContent), nextCursor: result.nextCursor };
}

export async function getPageById(ctx: PermCtx, id: string, include: readonly PublicPageInclude[] = []): Promise<PublicPageResource | null> {
  return getVisiblePage(ctx, eq(schema.pages.id, id), include);
}

export async function getPageByPath(ctx: PermCtx, path: string, include: readonly PublicPageInclude[] = []): Promise<PublicPageResource | null> {
  return getVisiblePage(ctx, eq(schema.pages.path, path), include);
}

export async function createPage(
  ctx: PermCtx,
  input: PublicPageCreateInput,
  include: readonly PublicPageInclude[] = [],
): Promise<PublicPageResource> {
  const created = await pageService.create(ctx, {
    path: input.path,
    title: input.title,
    contentSource: input.contentSource,
  });
  const page = await getPageById(ctx, created.pageId, include);
  if (!page) throw new DomainError('NOT_FOUND', 'Created page is not visible');
  return page;
}

export async function createDraft(ctx: PermCtx, pageId: string, input: PublicDraftCreateInput): Promise<PublicRevisionResource> {
  const page = await getPageRowById(pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  const created = await pageService.newDraft(ctx, page.path, input);
  const revision = await getRevision(ctx, pageId, created.versionNumber);
  if (!revision) throw new DomainError('NOT_FOUND', 'Created revision is not visible');
  return revision;
}

export async function updateProperties(
  ctx: PermCtx,
  pageId: string,
  input: PublicPagePropertiesInput,
  include: readonly PublicPageInclude[] = [],
): Promise<PublicPageResource> {
  const page = await getPageRowById(pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  const metadataUpdated = input.title
    ? await updatePageMetadata(ctx, pageId, {
        baseRevisionId: input.baseRevisionId ?? page.latestVersionId!,
        title: input.title,
      })
    : null;
  const updated = input.path
    ? await pageService.updateProperties(ctx, metadataUpdated?.path ?? page.path, {
        path: input.path,
        baseRevisionId: metadataUpdated?.latestRevision?.id ?? input.baseRevisionId,
      })
    : { pageId, newPath: metadataUpdated?.path ?? page.path };
  const view = await getPageById(ctx, updated.pageId, include);
  if (!view) throw new DomainError('NOT_FOUND', 'Updated page is not visible');
  return view;
}

// Revision history never returns Markdown source — fetch a single revision
// (GET /pages/{id}/revisions/{version}) for content.
const LIST_REVISION_OPTIONS: VisibleRevisionOptions = { includeContent: false };

export async function listRevisions(ctx: PermCtx, pageId: string, query: PublicRevisionListQuery): Promise<PublicRevisionListResponse> {
  const page = await getPageRowById(pageId);
  if (!page) return { items: [], nextCursor: null };
  const cursor = decodePublicCursor(query.cursor);
  const rows = await db
    .select()
    .from(schema.pageRevisions)
    .where(eq(schema.pageRevisions.pageId, page.id))
    .orderBy(desc(schema.pageRevisions.versionNumber))
    .limit(query.limit + 1)
    .offset(cursor.offset);

  const candidates = rows.filter(
    (row) => !query.status || query.status === 'all' || row.status === query.status,
  );
  const resolved = await Promise.all(
    candidates.map((row) => visibleRevisionResource(ctx, page, row, LIST_REVISION_OPTIONS)),
  );

  const items: PublicRevisionResource[] = [];
  for (const item of resolved) {
    if (item) items.push(item);
    if (items.length >= query.limit) break;
  }
  return {
    items,
    nextCursor: rows.length > query.limit ? nextPublicCursor({ offset: cursor.offset, limit: query.limit, itemCount: query.limit }) : null,
  };
}

export async function getRevision(ctx: PermCtx, pageId: string, version: number): Promise<PublicRevisionResource | null> {
  const page = await getPageRowById(pageId);
  if (!page) return null;
  const revision = await db.query.pageRevisions.findFirst({
    where: and(
      eq(schema.pageRevisions.pageId, page.id),
      eq(schema.pageRevisions.versionNumber, version),
    ),
  });
  if (!revision) return null;
  return visibleRevisionResource(ctx, page, revision);
}

export async function publishRevision(
  ctx: PermCtx,
  pageId: string,
  version: number,
  input: PublicPublicationInput,
  include: readonly PublicPageInclude[] = [],
): Promise<PublicPageResource> {
  const page = await getPageRowById(pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  await revisionService.publish(ctx, {
    path: page.path,
    version,
    expectedRevisionId: input.expectedRevisionId,
  });
  const view = await getPageById(ctx, page.id, include);
  if (!view) throw new DomainError('NOT_FOUND', 'Published page is not visible');
  return view;
}

export async function uploadAsset(ctx: PermCtx, bytes: Buffer): Promise<PublicAssetResource> {
  const uploaded = await contentAssets.uploadImage(ctx, bytes);
  const asset = await db.query.contentAssets.findFirst({
    where: eq(schema.contentAssets.id, uploaded.id),
  });
  if (!asset) throw new DomainError('NOT_FOUND', 'Uploaded asset not found');
  const url = `/api/v1/assets/${asset.id}/content`;
  return {
    id: asset.id,
    contentType: uploaded.contentType,
    sizeBytes: asset.sizeBytes,
    url,
    markdown: `![image](${url})`,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function getAsset(ctx: PermCtx, id: string): Promise<PublicAssetResource | null> {
  const visibility = await contentAssets.getServableImage(ctx, id);
  if (visibility.kind === 'not_found') return null;

  const asset = await db.query.contentAssets.findFirst({
    where: and(eq(schema.contentAssets.id, id), isNull(schema.contentAssets.deletedAt)),
  });
  if (!asset) return null;

  const url = `/api/v1/assets/${asset.id}/content`;
  return {
    id: asset.id,
    contentType: asset.contentType as PublicAssetResource['contentType'],
    sizeBytes: asset.sizeBytes,
    url,
    markdown: `![image](${url})`,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function getAssetContent(ctx: PermCtx, id: string) {
  return contentAssets.getServableImage(ctx, id);
}

export async function searchPages(ctx: PermCtx, query: PublicPageSearchQuery): Promise<PublicPageSearchResponse> {
  // The capability adapters index current published revisions. Preserve the
  // legacy read path for draft/all, cursor, and expanded-revision requests
  // while moving the common published search to the immediate engines.
  if (query.status !== 'published' || query.cursor || query.include.length > 0) {
    return searchPagesWithLegacyFilters(ctx, query);
  }

  const settings = await getSearchSettings();
  const result = await runCoordinatedSearch(ctx, {
    q: query.q.trim(),
    limit: query.limit,
    snapshot: {
      full_text: settings.fullTextSearchEnabled,
      fuzzy: settings.fuzzySearchEnabled,
      // GET remains a pure read: semantic work is never started here.
      semantic: false,
    },
    excerpt: { windowSize: query.excerptLength, show: true },
    // The existing GET contract has no administrator relevance threshold.
    minRelevanceScore: 0,
    immediateSearchTimeoutMs: settings.immediateSearchTimeoutMs,
  });

  const tagFilters = extractTagFilters(query);
  const frontmatterFilters = extractFrontmatterFilters(query);
  const items = result.items
    .filter((item) => {
      if (query.scope !== 'all' && item.field !== query.scope) return false;
      if (query.pathPrefix && item.page.path !== query.pathPrefix && !item.page.path.startsWith(`${query.pathPrefix}/`)) return false;
      const createdAt = new Date(item.page.createdAt);
      const updatedAt = new Date(item.page.updatedAt);
      if (query.createdStart && createdAt < query.createdStart) return false;
      if (query.createdEnd && createdAt > query.createdEnd) return false;
      if (query.updatedStart && updatedAt < query.updatedStart) return false;
      if (query.updatedEnd && updatedAt > query.updatedEnd) return false;
      if (tagFilters && !matchesTagFilters(item.page, tagFilters)) return false;
      if (frontmatterFilters && !matchesFrontmatterFilters(item.page.frontmatter, frontmatterFilters)) return false;
      return true;
    })
    .map(({ page, excerpt, relevanceScore, field }) => ({
      page,
      matchType: field,
      excerpt,
      score: relevanceScore,
    }))
    // GET has long exposed this display relevance as `score`. Keep its
    // ordering aligned with that public value; the hybrid POST response keeps
    // the coordinator's RRF order and fused score instead.
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));

  // Capability engines return one bounded, globally ranked snapshot. Keep the
  // existing envelope while avoiding a misleading cursor over a partial rank.
  return { items, nextCursor: null };
}

async function searchPagesWithLegacyFilters(ctx: PermCtx, query: PublicPageSearchQuery): Promise<PublicPageSearchResponse> {
  // Fetch through the internal (content-included) path rather than the public
  // listPages, since matchType/excerpt need contentSource before the public
  // page shape strips it.
  const pages = await listPagesInternal(
    ctx,
    {
      status: query.status,
      q: query.q,
      pathPrefix: query.pathPrefix,
      limit: query.limit,
      cursor: query.cursor,
      order: 'recent',
      include: query.include,
      createdStart: query.createdStart,
      createdEnd: query.createdEnd,
      updatedStart: query.updatedStart,
      updatedEnd: query.updatedEnd,
      tagFilters: extractTagFilters(query),
      frontmatterFilters: extractFrontmatterFilters(query),
    },
    { includeContent: true },
  );
  const q = query.q.toLowerCase();
  const items = pages.items
    .map((page) => {
      const pathMatch = page.path.toLowerCase().includes(q);
      const titleMatch = page.title.toLowerCase().includes(q);
      const contentMatch = page.contentSource?.toLowerCase().includes(q) ?? false;
      const matchType: 'path' | 'title' | 'content' = pathMatch ? 'path' : titleMatch ? 'title' : contentMatch ? 'content' : 'title';
      const excerpt = matchType === 'content' && page.contentSource ? buildExcerpt(page.contentSource, query.q, query.excerptLength) : null;
      const score = scoreSearchMatch(matchType, page, query.q);
      return { page: stripPageContent(page), matchType, excerpt, score };
    })
    .filter((item) => query.scope === 'all' || item.matchType === query.scope)
    // Real relevance ranking within this page of results; pagination itself still
    // walks the underlying table by recency (see listPagesInternal), since a
    // globally-ranked cursor would need a real search index rather than ILIKE.
    .sort((a, b) => b.score - a.score);

  return { items, nextCursor: pages.nextCursor };
}

/**
 * Header-only hybrid operation on the existing feature-013 POST resource.
 * All retrieval flows through the search coordinator: enabled capabilities
 * from the attempt snapshot start concurrently, lexical results return
 * immediately, and the idempotent retry of the same record resumes any
 * pending semantic action. The legacy GET route remains a pure lexical read.
 */
export async function hybridSearchPages(ctx: PermCtx, input: HybridSearchQueryInput): Promise<HybridPageSearchResponse> {
  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  const settings = await getSearchSettings();
  const settingsSnapshot: CapabilitySnapshot = {
    full_text: settings.fullTextSearchEnabled,
    fuzzy: settings.fuzzySearchEnabled,
    semantic: settings.semanticSearchEnabled,
  };

  let record: Awaited<ReturnType<typeof searchAnalytics.getOrCreateSearchRecord>> | null = null;
  try {
    record = await searchAnalytics.getOrCreateSearchRecord(ctx, input, space.id, {
      keywordResultCount: 0,
      semanticResultCount: 0,
      resultCount: 0,
      semanticState: 'skipped',
    }, settingsSnapshot);
  } catch (error) {
    // A telemetry outage must never turn readable lexical results into a
    // failed search. Without a durable record semantic work cannot safely
    // resume, so it is reported as generic reduced coverage instead.
    console.error('Failed to create hybrid search analytics:', error);
  }

  // An accepted attempt keeps the capability set it was created with, even if
  // an administrator changed the settings between polls (FR-010).
  const snapshot: CapabilitySnapshot = record
    ? (record.capabilitySnapshot as CapabilitySnapshot)
    : { ...settingsSnapshot, semantic: false };

  const result = await runCoordinatedSearch(ctx, {
    q: input.q.trim(),
    limit: input.limit,
    snapshot,
    excerpt: { windowSize: settings.excerptLength, show: settings.showExcerpts },
    minRelevanceScore: settings.minRelevanceScore,
    immediateSearchTimeoutMs: settings.immediateSearchTimeoutMs,
    attempt: record ? { searchRecordId: record.id } : undefined,
  });

  const degradedSemantic = !record && settingsSnapshot.semantic;
  const semanticState = degradedSemantic ? 'unavailable' : result.semanticState;
  const engineStates = degradedSemantic
    ? result.engineStates.map((state) => (state.capability === 'semantic' ? { ...state, state: 'unavailable' as const } : state))
    : result.engineStates;

  if (record) {
    try {
      await searchAnalytics.updateSearchRecord(record.id, {
        keywordResultCount: result.keywordReadableCount,
        semanticResultCount: result.semanticReadableCount,
        resultCount: result.items.length,
        semanticState,
        semanticActionId: result.semanticContinuationRef,
      });
    } catch (error) {
      console.error('Failed to update hybrid search analytics:', error);
    }
  }

  return {
    searchRecordId: record?.id ?? input.searchRecordId,
    semanticState,
    engineStates,
    items: result.items.map(({ field: _field, ...item }) => item),
  };
}

export async function getPageTree(ctx: PermCtx, query: PublicPageTreeQuery): Promise<PublicPageTreeResponse> {
  const space = await getDefaultSpace();
  if (!space) return { root: emptyNode(query.pathPrefix ?? ''), pageCount: 0 };

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return { root: emptyNode(query.pathPrefix ?? ''), pageCount: 0 };
  }

  const conditions: SQL[] = [
    eq(schema.pages.spaceId, space.id),
    isNull(schema.pages.deletedAt),
  ];
  if (query.status === 'published') {
    conditions.push(isNotNull(schema.pages.currentPublishedVersionId));
  }
  if (query.pathPrefix) {
    conditions.push(
      or(
        eq(schema.pages.path, query.pathPrefix),
        like(schema.pages.path, `${query.pathPrefix}/%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      authorId: schema.pages.authorId,
      currentPublishedVersionId: schema.pages.currentPublishedVersionId,
    })
    .from(schema.pages)
    .where(and(...conditions))
    .orderBy(schema.pages.path);

  type Row = { id: string; path: string; title: string; status: 'draft' | 'published' };
  const visible: Row[] = [];
  const userId = getActorUserId(ctx);
  for (const row of rows) {
    const status: Row['status'] = row.currentPublishedVersionId ? 'published' : 'draft';
    if (query.status === 'draft' && status !== 'draft') continue;
    if (query.status === 'published' && status !== 'published') continue;
    if (status === 'draft') {
      const isAuthor = userId ? row.authorId === userId : false;
      if (!can(ctx, 'read_draft', { kind: 'revision', pageId: row.id, version: 0 }, { isAuthor })) continue;
    }
    visible.push({ id: row.id, path: row.path, title: row.title, status });
  }

  return { root: buildTree(visible, query.pathPrefix), pageCount: visible.length };
}

const readCachedPublishedPageTree = unstable_cache(
  async () => getPageTree(buildAnonymousCtx(), { status: 'published' }),
  ['published-page-tree'],
  { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);

/** Cached tree for the public app shell; authenticated draft visibility is not included. */
export async function getCachedPublishedPageTree(): Promise<PublicPageTreeResponse> {
  return shouldUseDataCache()
    ? readCachedPublishedPageTree()
    : getPageTree(buildAnonymousCtx(), { status: 'published' });
}

function emptyNode(path: string): PublicPageTreeNode {
  return { path, segment: lastSegment(path), title: null, pageId: null, status: null, children: [] };
}

function lastSegment(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

function buildTree(pages: { id: string; path: string; title: string; status: 'draft' | 'published' }[], pathPrefix?: string): PublicPageTreeNode {
  const prefix = pathPrefix ?? '';
  const root: PublicPageTreeNode = { path: prefix, segment: lastSegment(prefix), title: null, pageId: null, status: null, children: [] };

  for (const page of pages) {
    const full = page.path;
    const relativePath = prefix ? full.slice(prefix.length + 1) : full;
    const segments = relativePath.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    let current = root;
    let accumulated = prefix;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      let child: PublicPageTreeNode | undefined = current.children.find((c) => c.segment === segment);
      if (!child) {
        child = { path: accumulated, segment, title: null, pageId: null, status: null, children: [] };
        current.children.push(child);
      }
      if (isLeaf) {
        child.title = page.title;
        child.pageId = page.id;
        child.status = page.status;
      }
      current = child;
    }
  }
  sortTreeChildren(root);
  return root;
}

/**
 * Order every node's children so the sidebar lists folders before pages, and
 * sorts each group alphabetically by display label (numeric-aware, so "2"
 * precedes "10"). A node with no page of its own is a pure folder; a node that
 * carries a `pageId` is a page even if it also nests children.
 */
function sortTreeChildren(node: PublicPageTreeNode): void {
  node.children.sort((a, b) => {
    const aIsFolder = a.pageId === null;
    const bIsFolder = b.pageId === null;
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    return (a.title ?? a.segment).localeCompare(b.title ?? b.segment, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
  for (const child of node.children) sortTreeChildren(child);
}

// ---------------------------------------------------------------------------
// Phase 1: Soft-delete
// ---------------------------------------------------------------------------

export async function deletePage(ctx: PermCtx, pageId: string): Promise<void> {
  const page = await getPageRowById(pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  await pageService.remove(ctx, page.path);
}

// ---------------------------------------------------------------------------
// Phase 2: Backlinks
// ---------------------------------------------------------------------------

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

export type PublicBacklink = {
  pageId: string;
  path: string;
  title: string;
  linkText: string;
};

export async function getBacklinks(ctx: PermCtx, pageId: string): Promise<{ items: PublicBacklink[] }> {
  const targetPage = await getPageRowById(pageId);
  if (!targetPage) return { items: [] };

  const space = await getDefaultSpace();
  if (!space) return { items: [] };
  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return { items: [] };
  }

  const targetPath = targetPage.path;
  const rows = await db
    .select({
      id: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      authorId: schema.pages.authorId,
    })
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
        isNotNull(schema.pages.currentPublishedVersionId),
      ),
    );

  const items: PublicBacklink[] = [];
  for (const row of rows) {
    if (row.id === pageId) continue;
    const page = await getVisiblePage(ctx, eq(schema.pages.id, row.id), []);
    if (!page?.contentSource) continue;
    let matched = false;
    let linkText = '';
    for (const match of page.contentSource.matchAll(MARKDOWN_LINK_RE)) {
      const text = match[1] ?? '';
      const href = match[2] ?? '';
      const cleanHref = href.replace(/^\//, '').replace(/^\/api\/v1\/pages\//, '');
      if (cleanHref === targetPath || href === targetPath || href === `/api/v1/pages/${pageId}`) {
        matched = true;
        linkText = text;
        break;
      }
    }
    if (matched) {
      items.push({ pageId: row.id, path: row.path, title: row.title, linkText });
    }
  }
  return { items };
}

// ---------------------------------------------------------------------------
// 010: AI Curation API — outbound links & graph traversal
// ---------------------------------------------------------------------------

type SpaceRow = { id: string; slug: string; anonymousRead: boolean; defaultLocale: string };

async function findPageRowByPathAnyStatus(spaceId: string, targetPath: string): Promise<PageRow | null> {
  return (
    (await db.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, spaceId), eq(schema.pages.path, targetPath)),
    })) ?? null
  );
}

/** Accepts a bare page path, an absolute path, or an `/api/v1/pages/{path}` URL. */
function normalizeLinkTarget(rawTarget: string): string {
  return (rawTarget.split(/[?#]/)[0] ?? '')
    .replace(/^\//, '')
    .replace(/^api\/v1\/pages\//, '');
}

type ResolvedLink =
  | { kind: 'resolved'; item: PublicOutboundLink }
  | { kind: 'dangling'; item: PublicDanglingLink }
  | { kind: 'omit' };

async function resolveLinkTarget(
  ctx: PermCtx,
  space: SpaceRow,
  source: PublicOutboundLink['source'],
  rawTarget: string,
  linkText: string,
): Promise<ResolvedLink> {
  const targetPath = normalizeLinkTarget(rawTarget);
  const row = await findPageRowByPathAnyStatus(space.id, targetPath);

  if (!row) {
    return { kind: 'dangling', item: { source, targetPath, linkText } };
  }

  if (row.deletedAt) {
    const userId = getActorUserId(ctx);
    const isAuthor = userId ? row.authorId === userId : false;
    const canSeeDeleted =
      can(ctx, 'read_draft', { kind: 'revision', pageId: row.id, version: 0 }, { isAuthor }) ||
      can(ctx, 'delete', { kind: 'page_list' });
    if (!canSeeDeleted) return { kind: 'omit' };
    return { kind: 'dangling', item: { source, targetPath, targetStatus: 'deleted', linkText } };
  }

  const resolved = await visiblePageResource(ctx, space, row, { includeContent: false, include: [] });
  if (!resolved) {
    return { kind: 'dangling', item: { source, targetPath, linkText } };
  }
  return {
    kind: 'resolved',
    item: { source, targetPath, targetPageId: resolved.id, targetStatus: resolved.status, linkText },
  };
}

export async function getOutboundLinks(ctx: PermCtx, pageId: string): Promise<PublicOutboundLinksResponse> {
  const page = await getPageById(ctx, pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Page not found');

  const contentSource = page.contentSource ?? '';
  const { frontmatter } = parsePageFrontmatter(contentSource);
  const markdownLinks = findMarkdownLinks(contentSource);
  const relatedPages = findFrontmatterRelatedPages(frontmatter);

  const links: PublicOutboundLink[] = [];
  const dangling: PublicDanglingLink[] = [];
  const external: PublicExternalLink[] = [];

  for (const link of markdownLinks) {
    if (link.external) {
      external.push({ source: 'markdown', href: link.target, linkText: link.linkText });
      continue;
    }
    const resolved = await resolveLinkTarget(ctx, space, link.source, link.target, link.linkText);
    if (resolved.kind === 'resolved') links.push(resolved.item);
    else if (resolved.kind === 'dangling') dangling.push(resolved.item);
  }

  for (const relatedPath of relatedPages) {
    const resolved = await resolveLinkTarget(ctx, space, 'frontmatter', relatedPath, relatedPath);
    if (resolved.kind === 'resolved') links.push(resolved.item);
    else if (resolved.kind === 'dangling') dangling.push(resolved.item);
  }

  return { pageId: page.id, links, dangling, external };
}

/** Pages (readable to `ctx`) that outbound-link to `pageId`, with the source of the linking edge. */
async function findInboundNeighbors(ctx: PermCtx, space: SpaceRow, pageId: string, targetPath: string): Promise<Array<{ pageId: string; path: string; title: string }>> {
  const rows = await db
    .select({ page: schema.pages })
    .from(schema.pages)
    .where(and(eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)));

  const neighbors: Array<{ pageId: string; path: string; title: string }> = [];
  for (const { page: row } of rows) {
    if (row.id === pageId) continue;
    const resource = await visiblePageResource(ctx, space, row, { includeContent: true, include: [] });
    if (!resource?.contentSource) continue;
    const { frontmatter } = parsePageFrontmatter(resource.contentSource);
    const targets = [
      ...findMarkdownLinks(resource.contentSource)
        .filter((link) => !link.external)
        .map((link) => normalizeLinkTarget(link.target)),
      ...findFrontmatterRelatedPages(frontmatter),
    ];
    if (targets.includes(targetPath)) {
      neighbors.push({ pageId: row.id, path: row.path, title: row.title });
    }
  }
  return neighbors;
}

async function outboundNeighbors(ctx: PermCtx, node: { pageId: string }): Promise<PublicNeighborNode[]> {
  const outbound = await getOutboundLinks(ctx, node.pageId);
  const neighbors: PublicNeighborNode[] = [];
  for (const link of outbound.links) {
    const target = await getPageById(ctx, link.targetPageId);
    neighbors.push({
      pageId: link.targetPageId,
      path: link.targetPath,
      title: target?.title ?? link.targetPath,
      viaLinkSource: link.source as PublicNeighborVia,
    });
  }
  return neighbors;
}

/**
 * Bounded multi-hop neighborhood traversal (FR-018). `direction: 'in'`/`'both'`
 * reuses the same whole-space scan as `getBacklinks` (no link-index table
 * exists — FR-029 forbids adding one), so it shares that endpoint's O(pages)
 * cost per hop; `direction: 'out'` (the default) is bounded by fanout only.
 */
export async function getNeighborhood(
  ctx: PermCtx,
  nodeId: string,
  depth: number,
  direction: 'out' | 'in' | 'both',
): Promise<PublicNeighborhoodResponse> {
  const rootPage = await getPageById(ctx, nodeId);
  if (!rootPage) throw new DomainError('NOT_FOUND', 'Page not found');
  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Page not found');

  const root = { pageId: rootPage.id, path: rootPage.path, title: rootPage.title };
  const visited = new Set<string>([root.pageId]);
  const tiers: PublicNeighborNode[][] = [[{ pageId: root.pageId, path: root.path, title: root.title }]];

  let frontier: Array<{ pageId: string; path: string }> = [{ pageId: root.pageId, path: root.path }];
  for (let hop = 0; hop < depth; hop++) {
    const nextTier: PublicNeighborNode[] = [];
    for (const node of frontier) {
      if (direction === 'out' || direction === 'both') {
        for (const neighbor of await outboundNeighbors(ctx, node)) {
          if (visited.has(neighbor.pageId)) continue;
          visited.add(neighbor.pageId);
          nextTier.push(neighbor);
        }
      }
      if (direction === 'in' || direction === 'both') {
        for (const neighbor of await findInboundNeighbors(ctx, space, node.pageId, node.path)) {
          if (visited.has(neighbor.pageId)) continue;
          visited.add(neighbor.pageId);
          nextTier.push({ ...neighbor, viaLinkSource: 'backlink' });
        }
      }
    }
    if (nextTier.length === 0) break;
    tiers.push(nextTier);
    frontier = nextTier.map((n) => ({ pageId: n.pageId, path: n.path }));
  }

  return { root, tiers };
}

// ---------------------------------------------------------------------------
// Phase 3: Revision Diff
// ---------------------------------------------------------------------------

export type PublicRevisionDiff = {
  fromVersion: number;
  toVersion: number;
  diff: string;
  additions: number;
  deletions: number;
};

export async function getDiff(
  ctx: PermCtx,
  pageId: string,
  toVersion: number,
  fromVersion: number,
): Promise<PublicRevisionDiff | null> {
  const [toRevision, fromRevision] = await Promise.all([
    getRevision(ctx, pageId, toVersion),
    getRevision(ctx, pageId, fromVersion),
  ]);
  if (!toRevision || !fromRevision) return null;

  const toSource = toRevision.contentSource ?? '';
  const fromSource = fromRevision.contentSource ?? '';
  const { diffLines, createPatch } = await import('diff');
  const patch = createPatch(`v${fromVersion}`, fromSource, toSource, '', '');
  const changes = diffLines(fromSource, toSource);
  let additions = 0;
  let deletions = 0;
  for (const part of changes) {
    if (part.added) additions += part.value.split('\n').filter(Boolean).length;
    if (part.removed) deletions += part.value.split('\n').filter(Boolean).length;
  }
  return { fromVersion, toVersion, diff: patch, additions, deletions };
}

// ---------------------------------------------------------------------------
// Phase 4: Batch Create
// ---------------------------------------------------------------------------

export type PublicBatchCreateResult = {
  created: { id: string; path: string; title: string; revisionId: string }[];
  count: number;
};

export async function batchCreatePages(
  ctx: PermCtx,
  input: { pages: PublicPageCreateInput[] },
): Promise<PublicBatchCreateResult> {
  const created: PublicBatchCreateResult['created'] = [];
  await db.transaction(async () => {
    for (const pageInput of input.pages) {
      const result = await pageService.create(ctx, {
        path: pageInput.path,
        title: pageInput.title,
        contentSource: pageInput.contentSource,
      });
      const page = await getPageById(ctx, result.pageId, ['latestRevision']);
      if (!page) throw new DomainError('NOT_FOUND', 'Created page is not visible');
      created.push({
        id: page.id,
        path: page.path,
        title: page.title,
        revisionId: page.latestRevision?.id ?? '',
      });
    }
  });
  return { created, count: created.length };
}

// ---------------------------------------------------------------------------
// 010: AI Curation API — bulk write operations
// ---------------------------------------------------------------------------

function leafSlugFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

function toItemError(error: unknown): { code: string; message: string } {
  if (error instanceof DomainError) {
    return { code: mapPublicDomainErrorCode(error.code).code, message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'Unexpected error' };
}

async function batchUpdateOneItem(
  ctx: PermCtx,
  space: { id: string },
  item: PublicPageBatchUpdateItemInput,
  dryRun: boolean,
): Promise<PublicBatchItemResult> {
  const page = await db.query.pages.findFirst({
    where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.id, item.pageId), isNull(schema.pages.deletedAt)),
  });
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

  const userId = getActorUserId(ctx);
  const isAuthor = userId ? page.authorId === userId : false;
  if (!userId || !can(ctx, 'edit', { kind: 'page', pageId: page.id }, { isAuthor })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
  }
  if (page.latestVersionId !== item.baseRevisionId) {
    throw new DomainError('STALE_REVISION', 'The page has changed since the supplied base revision');
  }

  const nextPath = item.path ?? page.path;
  const hasPathChange = nextPath !== page.path;
  if (hasPathChange) {
    const collision = await db.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, nextPath), isNull(schema.pages.deletedAt)),
    });
    if (collision) throw new DomainError('PAGE_PATH_CONFLICT', 'A page with this path already exists');
  }

  const latestRevision = page.latestVersionId
    ? await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.latestVersionId) })
    : null;
  const existingContent = latestRevision ? (await readMarkdownFromDatabase(latestRevision)) ?? '' : '';
  const { frontmatter: existingFrontmatter, markdown: body } = parsePageFrontmatter(existingContent);

  let nextContent = existingContent;
  let nextFrontmatterPreview: Record<string, unknown> | null = existingFrontmatter;
  const hasFrontmatterChange = Boolean(item.frontmatter);
  if (item.frontmatter) {
    const merged: Record<string, unknown> = { ...(existingFrontmatter ?? {}) };
    for (const [key, value] of Object.entries(item.frontmatter)) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    nextFrontmatterPreview = merged;
    nextContent = Object.keys(merged).length > 0
      ? `---\n${stringifyYaml(merged, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`
      : body;
  }

  const nextTitle = item.title ?? page.title;
  const nextMetadata = metadataFromSource(nextContent, nextTitle);
  const hasTitleChange = item.title !== undefined && item.title !== page.title;
  if (!hasPathChange && !hasTitleChange && !hasFrontmatterChange) {
    return { pageId: page.id, status: 'success', revisionId: page.latestVersionId ?? undefined };
  }

  if (dryRun) {
    const preview: Record<string, unknown> = {};
    if (hasTitleChange) preview.title = nextTitle;
    if (hasPathChange) preview.path = nextPath;
    if (hasFrontmatterChange) preview.frontmatter = nextFrontmatterPreview;
    return { pageId: page.id, status: 'success', preview };
  }

  // Every successful title/path/frontmatter change creates a new revision
  // (FR-024), unlike the single-page updateProperties endpoint (which only
  // versions content changes) — the batch API is explicitly all-or-versioned.
  const { html, hash } = renderMarkdown(nextContent);
  const versionRows = await db
    .select({ value: max(schema.pageRevisions.versionNumber) })
    .from(schema.pageRevisions)
    .where(eq(schema.pageRevisions.pageId, page.id));
  const nextVersion = (versionRows[0]?.value ?? 0) + 1;
  const revisionId = randomUUID();

  await db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: nextVersion,
        contentType: 'text/markdown',
        contentSource: nextContent,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
      })
      .returning();
    if (!revision) throw new Error('Failed to create revision');
    await persistRevisionMetadata(tx, {
      revisionId: revision.id,
      spaceId: space.id,
      source: nextContent,
      fallbackTitle: nextMetadata.title,
    });
    await syncRevisionAssetRefs(tx, revision.id, nextContent);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);
    await tx
      .update(schema.pages)
      .set({
        path: nextPath,
        slug: leafSlugFromPath(nextPath),
        title: nextMetadata.title,
        latestVersionId: revision.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));
  });

  await kickReplication();
  if (hasPathChange) await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(page.id, ctx);

  return { pageId: page.id, status: 'success', revisionId };
}

export async function batchUpdatePages(ctx: PermCtx, input: PublicPageBatchUpdateInput, options: { dryRun: boolean }): Promise<PublicPageBatchUpdateResult> {
  if (!can(ctx, 'edit', { kind: 'page_list' })) {
    throw new DomainError('FORBIDDEN', 'This API key cannot edit pages');
  }
  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  const results: PublicBatchItemResult[] = [];
  for (const item of input.items) {
    try {
      results.push(await batchUpdateOneItem(ctx, space, item, options.dryRun));
    } catch (error) {
      results.push({ pageId: item.pageId, status: 'failed', error: toItemError(error) });
    }
  }
  const successCount = results.filter((r) => r.status === 'success').length;
  return { results, successCount, failureCount: results.length - successCount, dryRun: options.dryRun || undefined };
}

async function batchSoftDeleteOneItem(ctx: PermCtx, space: { id: string }, pageId: string, dryRun: boolean): Promise<PublicBatchItemResult> {
  const page = await db.query.pages.findFirst({
    where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt)),
  });
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

  const userId = getActorUserId(ctx);
  const isAuthor = userId ? page.authorId === userId : false;
  if (!can(ctx, 'delete', { kind: 'page', pageId: page.id }, { isAuthor })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to delete this page');
  }

  if (dryRun) {
    return { pageId: page.id, status: 'success', preview: { path: page.path, title: page.title } };
  }

  await db.update(schema.pages).set({ deletedAt: new Date() }).where(eq(schema.pages.id, page.id));
  await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(page.id, ctx);
  return { pageId: page.id, status: 'success' };
}

export async function batchSoftDeletePages(ctx: PermCtx, input: PublicPageBatchDeleteInput, options: { dryRun: boolean }): Promise<PublicPageBatchDeleteResult> {
  // 'delete' is normally isAuthor-gated for non-admins (see roleAllows), but
  // authorship is only knowable per-page, not at the batch boundary. FR-025
  // instead requires a flat Editor/Admin + delete-scope gate here (Reader
  // keys always rejected); per-item authorship is still enforced below.
  const isReaderOrAnonymous = ctx.actor.kind === 'anonymous' || ctx.actor.role === 'reader';
  if (isReaderOrAnonymous || !can(ctx, 'delete', { kind: 'page_list' }, { isAuthor: true })) {
    throw new DomainError('FORBIDDEN', 'This API key cannot delete pages');
  }
  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  const results: PublicBatchItemResult[] = [];
  for (const pageId of input.pageIds) {
    try {
      results.push(await batchSoftDeleteOneItem(ctx, space, pageId, options.dryRun));
    } catch (error) {
      results.push({ pageId, status: 'failed', error: toItemError(error) });
    }
  }
  const successCount = results.filter((r) => r.status === 'success').length;
  return { results, successCount, failureCount: results.length - successCount, dryRun: options.dryRun || undefined };
}

// ---------------------------------------------------------------------------
// Phase 5: Stats
// ---------------------------------------------------------------------------

export type PublicStats = {
  totalPages: number;
  publishedPages: number;
  draftPages: number;
  deletedPages: number;
  recentActivity: { createdInLast7Days: number; updatedInLast7Days: number };
  directories: { segment: string; pageCount: number }[];
  orphans?: { id: string; path: string; title: string }[];
};

export async function getStats(
  ctx: PermCtx,
  options: { includeOrphans?: boolean } = {},
): Promise<PublicStats> {
  const space = await getDefaultSpace();
  if (!space) {
    return { totalPages: 0, publishedPages: 0, draftPages: 0, deletedPages: 0, recentActivity: { createdInLast7Days: 0, updatedInLast7Days: 0 }, directories: [] };
  }

  const canSeeDrafts = can(ctx, 'read_draft', { kind: 'revision', pageId: '00000000-0000-0000-0000-000000000000', version: 0 }, { isAuthor: false });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const allRows = await db
    .select({
      id: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      authorId: schema.pages.authorId,
      currentPublishedVersionId: schema.pages.currentPublishedVersionId,
      deletedAt: schema.pages.deletedAt,
      createdAt: schema.pages.createdAt,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .where(eq(schema.pages.spaceId, space.id));

  let publishedPages = 0;
  let draftPages = 0;
  let deletedPages = 0;
  let createdInLast7Days = 0;
  let updatedInLast7Days = 0;
  const dirMap = new Map<string, number>();
  const visiblePublishedPaths = new Set<string>();

  const userId = getActorUserId(ctx);
  for (const row of allRows) {
    if (row.deletedAt) {
      deletedPages += 1;
      continue;
    }
    const isPublished = row.currentPublishedVersionId !== null;
    if (isPublished) {
      publishedPages += 1;
      visiblePublishedPaths.add(row.path);
    } else {
      if (!canSeeDrafts) continue;
      const isAuthor = userId ? row.authorId === userId : false;
      if (!can(ctx, 'read_draft', { kind: 'revision', pageId: row.id, version: 0 }, { isAuthor })) continue;
      draftPages += 1;
    }
    if (row.createdAt >= sevenDaysAgo) createdInLast7Days += 1;
    if (row.updatedAt >= sevenDaysAgo) updatedInLast7Days += 1;
    const topSegment = row.path.split('/')[0] ?? '(root)';
    dirMap.set(topSegment, (dirMap.get(topSegment) ?? 0) + 1);
  }

  const directories = [...dirMap.entries()]
    .map(([segment, pageCount]) => ({ segment, pageCount }))
    .sort((a, b) => b.pageCount - a.pageCount);

  let orphans: PublicStats['orphans'];
  if (options.includeOrphans && visiblePublishedPaths.size > 0) {
    const linkedPaths = new Set<string>();
    for (const row of allRows) {
      if (row.deletedAt || !row.currentPublishedVersionId) continue;
      const page = await getVisiblePage(ctx, eq(schema.pages.id, row.id), []);
      if (!page?.contentSource) continue;
      for (const match of page.contentSource.matchAll(MARKDOWN_LINK_RE)) {
        const href = (match[2] ?? '').replace(/^\//, '');
        if (href) linkedPaths.add(href);
      }
    }
    orphans = allRows
      .filter((row) => !row.deletedAt && row.currentPublishedVersionId && visiblePublishedPaths.has(row.path) && !linkedPaths.has(row.path))
      .map((row) => ({ id: row.id, path: row.path, title: row.title }));
  }

  return {
    totalPages: publishedPages + draftPages,
    publishedPages,
    draftPages,
    deletedPages,
    recentActivity: { createdInLast7Days, updatedInLast7Days },
    directories,
    ...(orphans ? { orphans } : {}),
  };
}

// ---------------------------------------------------------------------------
// Phase 6: Duplicate Detection
// ---------------------------------------------------------------------------

export type PublicSimilarResult = {
  pageId: string;
  path: string;
  title: string;
  score: number;
};

function bigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) result.add(s.slice(i, i + 2));
  return result;
}

function diceCoefficient(a: string, b: string): number {
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  if (bgA.size === 0 || bgB.size === 0) return 0;
  let intersection = 0;
  for (const bg of bgA) if (bgB.has(bg)) intersection += 1;
  return (2 * intersection) / (bgA.size + bgB.size);
}

function levenshteinNormalized(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  const matrix: number[][] = Array.from({ length: la.length + 1 }, () => new Array(lb.length + 1).fill(0));
  for (let i = 0; i <= la.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= lb.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= la.length; i++) {
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(matrix[i - 1]![j]! + 1, matrix[i]![j - 1]! + 1, matrix[i - 1]![j - 1]! + cost);
    }
  }
  const distance = matrix[la.length]![lb.length]!;
  return 1 - distance / Math.max(la.length, lb.length);
}

export async function findSimilar(
  ctx: PermCtx,
  input: { title?: string; path?: string; threshold?: number },
): Promise<{ results: PublicSimilarResult[]; threshold: number }> {
  const threshold = input.threshold ?? 0.5;
  const space = await getDefaultSpace();
  if (!space) return { results: [], threshold };

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return { results: [], threshold };
  }

  const rows = await db
    .select({ id: schema.pages.id, path: schema.pages.path, title: schema.pages.title })
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
        isNotNull(schema.pages.currentPublishedVersionId),
      ),
    );

  const results: PublicSimilarResult[] = [];
  for (const row of rows) {
    let score = 0;
    let components = 0;
    if (input.path) {
      score += diceCoefficient(input.path, row.path);
      components += 1;
    }
    if (input.title) {
      score += levenshteinNormalized(input.title, row.title);
      components += 1;
    }
    const combined = components > 0 ? score / components : 0;
    if (combined >= threshold) {
      results.push({ pageId: row.id, path: row.path, title: row.title, score: Math.round(combined * 100) / 100 });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return { results, threshold };
}

/** Create a normal draft revision from an additive typed metadata patch. */
export async function updatePageMetadata(ctx: PermCtx, pageId: string, input: PublicPageMetadataInput): Promise<PublicPageResource> {
  const page = await getPageRowById(pageId);
  if (!page || !page.latestVersionId) throw new DomainError('NOT_FOUND', 'Page not found');
  const userId = getActorUserId(ctx);
  const isAuthor = userId ? page.authorId === userId : false;
  if (!userId || !can(ctx, 'edit', { kind: 'page', pageId }, { isAuthor })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
  }
  const latest = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.latestVersionId) });
  if (!latest) throw new DomainError('NOT_FOUND', 'Latest revision not found');
  const source = (await readMarkdownFromDatabase(latest)) ?? '';
  const patched = patchMetadata(source, input, page.title);
  await pageService.newDraft(ctx, page.path, {
    title: patched.metadata.title,
    contentSource: patched.source,
    baseRevisionId: input.baseRevisionId,
  });
  const result = await getPageById(ctx, pageId, ['latestRevision']);
  if (!result) throw new DomainError('NOT_FOUND', 'Page not found');
  return result;
}

/**
 * Replace a page's tags and publish immediately, so inline tag edits take
 * effect on the live page without a manual publish step. Drafts the change
 * through the normal metadata path (which enforces edit permission) and then
 * publishes the new revision (which enforces publish permission).
 */
export async function setPageTags(ctx: PermCtx, pageId: string, tags: string[]): Promise<PublicPageResource> {
  const page = await getPageRowById(pageId);
  if (!page || !page.latestVersionId) throw new DomainError('NOT_FOUND', 'Page not found');
  const drafted = await updatePageMetadata(ctx, pageId, { baseRevisionId: page.latestVersionId, tags });
  const version = drafted.latestRevision?.version;
  if (version == null) throw new DomainError('NOT_FOUND', 'Draft revision not found after tag update');
  return publishRevision(ctx, pageId, version, {}, ['latestRevision']);
}
