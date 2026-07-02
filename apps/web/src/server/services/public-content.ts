import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or, like, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type {
  PublicAssetResource,
  PublicDraftCreateInput,
  PublicPageCreateInput,
  PublicPageInclude,
  PublicPageListQuery,
  PublicPageListResponse,
  PublicPagePropertiesInput,
  PublicPageResource,
  PublicPageSearchQuery,
  PublicPageSearchResponse,
  PublicPageTreeNode,
  PublicPageTreeQuery,
  PublicPageTreeResponse,
  PublicPublicationInput,
  PublicRevisionListQuery,
  PublicRevisionListResponse,
  PublicRevisionResource,
} from '@next-wiki/shared';
import { decodePublicCursor, nextPublicCursor } from '@/server/api/public-pagination';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import * as contentAssets from '@/server/services/content-assets';

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

  const [contentSource, pageAuthor, latestRevision, publishedRevision] = await Promise.all([
    options.includeContent ? readMarkdownFromDatabase(current) : Promise.resolve(undefined),
    author(page.authorId),
    wantsLatest ? revisionSummary(ctx, page, visibleLatest) : Promise.resolve(undefined),
    wantsPublished ? revisionSummary(ctx, page, published) : Promise.resolve(undefined),
  ]);

  return {
    id: page.id,
    spaceSlug: space.slug,
    path: page.path,
    locale: page.locale,
    title: page.title,
    contentSource,
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
  const [summary, contentSource] = await Promise.all([
    revisionSummary(ctx, page, revision),
    options.includeContent ? readMarkdownFromDatabase(revision) : Promise.resolve(undefined),
  ]);
  return { ...summary!, contentSource };
}

type ListPagesQuery = {
  status: 'published' | 'draft' | 'all';
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

  const cursor = decodePublicCursor(query.cursor);
  const conditions: SQL[] = [
    eq(schema.pages.spaceId, space.id),
    isNull(schema.pages.deletedAt),
  ];
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
    rows.map(({ page }) =>
      visiblePageResource(ctx, space, page, {
        includeContent: options.includeContent,
        include: query.include,
      }),
    ),
  );

  const items: PublicPageResource[] = [];
  for (const item of resolved) {
    if (!item) continue;
    if (query.status === 'draft' && item.status !== 'draft') continue;
    if (query.q) {
      // The SQL predicate above already matches path/title/content; this re-check
      // covers rows whose q-match relies on locale/permission-adjusted content.
      const q = query.q.toLowerCase();
      if (!item.path.toLowerCase().includes(q) && !item.title.toLowerCase().includes(q) && !item.contentSource?.toLowerCase().includes(q)) {
        continue;
      }
    }
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
  const result = await listPagesInternal(ctx, query, { includeContent: Boolean(query.q) });
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
  const updated = await pageService.updateProperties(ctx, page.path, input);
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
  return root;
}
