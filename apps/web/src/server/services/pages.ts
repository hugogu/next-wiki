import { randomUUID } from 'node:crypto';
import { eq, and, isNull, desc, max, count, asc, ilike, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { DomainError } from '@/server/errors';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { assertNotMigrating } from '@/server/services/migration';
import { pathSchema } from '@next-wiki/shared';
import type {
  AdminPageListFilters,
  AdminPageListResult,
  AdminPageSortDirection,
  AdminPageSortKey,
  AdminPageStats,
  LivePage,
  PageSummary,
  EditableView,
  RevisionSummary,
  RevisionView,
} from '@next-wiki/shared';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import {
  readMarkdownFromDatabase,
  readMarkdownWithFallback,
} from '@/server/content-store/read-router';
import { enqueueGitExport } from '@/server/services/git-export';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';

const DEFAULT_SPACE_SLUG = 'default';
const ADMIN_PAGE_SIZE = 25;
const ADMIN_PAGE_SORTS = new Set<AdminPageSortKey>(['title', 'path', 'author', 'updatedAt', 'createdAt', 'edits']);
const ADMIN_SORT_DIRECTIONS = new Set<AdminPageSortDirection>(['asc', 'desc']);
const HTML_LINK_RE = /<a\b[^>]*\bhref=(["'])(.*?)\1/gi;

async function getDefaultSpace() {
  return db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
}

function getUserId(ctx: PermCtx): string | null {
  return getActorUserId(ctx);
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
    ...(filters.title?.trim() ? { title: filters.title.trim() } : {}),
    ...(filters.author?.trim() ? { author: filters.author.trim() } : {}),
    ...(filters.path?.trim() ? { path: filters.path.trim() } : {}),
    ...(filters.dateFrom?.trim() ? { dateFrom: filters.dateFrom.trim() } : {}),
    ...(filters.dateTo?.trim() ? { dateTo: filters.dateTo.trim() } : {}),
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
  return and(
    eq(schema.pages.spaceId, spaceId),
    isNull(schema.pages.deletedAt),
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
  const space = await getDefaultSpace();
  if (!space) return [];

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return [];
  }

  const query = db
    .select({
      path: schema.pages.path,
      title: schema.pages.title,
      authorDisplayName: schema.users.displayName,
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
      ),
    )
    .orderBy(
      options.order === 'recent' ? desc(schema.pageRevisions.publishedAt) : schema.pages.path,
    )
    .$dynamic();

  const limited = options.limit != null ? query.limit(options.limit) : query;
  const paged = options.offset != null ? limited.offset(options.offset) : limited;
  const rows = await paged;

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    authorDisplayName: r.authorDisplayName,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Total number of published pages in the default space, mirroring `listPublished`'s filter. */
export async function countPublished(ctx: PermCtx): Promise<number> {
  const space = await getDefaultSpace();
  if (!space) return 0;

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return 0;
  }

  const [row] = await db
    .select({ value: count() })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
      ),
    );

  return row?.value ?? 0;
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
  const space = await getDefaultSpace();
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
  const space = await getDefaultSpace();
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
  const space = await getDefaultSpace();
  if (!space) return null;

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return null;
  }

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;

  const userId = getUserId(ctx);
  const isAuthor = userId ? page.authorId === userId : false;

  if (page.currentPublishedVersionId) {
    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, page.currentPublishedVersionId),
    });
    if (!revision) return null;

    const author = await db.query.users.findFirst({
      where: eq(schema.users.id, page.authorId),
    });

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
    };
  }

  if (!can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, { isAuthor })) {
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
  };
}

export async function getById(ctx: PermCtx, pageId: string): Promise<LivePage | null> {
  const space = await getDefaultSpace();
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
 * Returns true if the caller is allowed to create pages in the default space.
 */
export async function canCreate(ctx: PermCtx): Promise<boolean> {
  const space = await getDefaultSpace();
  if (!space) return false;
  return can(ctx, 'create', { kind: 'page_list' });
}

export async function remove(ctx: PermCtx, path: string): Promise<void> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to delete pages');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

  const isAuthor = page.authorId === userId;
  if (!can(ctx, 'delete', { kind: 'page', pageId: page.id }, { isAuthor })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to delete this page');
  }

  await db
    .update(schema.pages)
    .set({ deletedAt: new Date() })
    .where(eq(schema.pages.id, page.id));
  await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(page.id, ctx);
}

export async function create(
  ctx: PermCtx,
  input: { path: string; title: string; contentSource: string },
): Promise<{ pageId: string; versionId: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to create pages');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  if (!can(ctx, 'create', { kind: 'page_list' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to create pages');
  }

  const pathCheck = pathSchema.safeParse(input.path);
  if (!pathCheck.success) {
    throw new DomainError('BAD_REQUEST', pathCheck.error.issues[0]?.message ?? 'Invalid path');
  }

  await assertNotMigrating();
  const revisionId = randomUUID();

  const created = await db.transaction(async (tx) => {
    const existing = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, input.path)),
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'A page with this path already exists');
    }

    const { html, hash } = renderMarkdown(input.contentSource);

    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: space.id,
        slug: leafSlugFromPath(input.path),
        path: input.path,
        title: input.title,
        authorId: userId,
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
        contentSource: input.contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
      })
      .returning();

    if (!revision) throw new Error('Failed to create revision');

    await syncRevisionAssetRefs(tx, revision.id, input.contentSource);
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
  input: { title: string; contentSource: string; baseRevisionId?: string; baseContentHash?: string },
): Promise<{ versionId: string; versionNumber: number }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to edit pages');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  await assertNotMigrating();
  const revisionId = randomUUID();

  const created = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, path),
        isNull(schema.pages.deletedAt),
      ),
    });

    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id })) {
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
    const { html, hash } = renderMarkdown(input.contentSource);

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: nextVersion,
        contentType: 'text/markdown',
        contentSource: input.contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
      })
      .returning();

    if (!revision) throw new Error('Failed to create revision');

    await syncRevisionAssetRefs(tx, revision.id, input.contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);

    await tx
      .update(schema.pages)
      .set({
        title: input.title,
        latestVersionId: revision.id,
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
): Promise<{ pageId: string; newPath: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to edit page properties');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  if (!input.path && !input.title) {
    throw new DomainError('BAD_REQUEST', 'Provide path or title');
  }

  if (input.path) {
    const pathCheck = pathSchema.safeParse(input.path);
    if (!pathCheck.success) {
      throw new DomainError('BAD_REQUEST', pathCheck.error.issues[0]?.message ?? 'Invalid path');
    }
  }

  const result = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, currentPath),
        isNull(schema.pages.deletedAt),
      ),
    });

    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id })) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
    }

    if (input.baseRevisionId && page.latestVersionId !== input.baseRevisionId) {
      throw new DomainError('STALE_REVISION', 'The page has changed since the supplied base revision');
    }

    const nextPath = input.path ?? currentPath;
    if (nextPath !== currentPath) {
      const existing = await tx.query.pages.findFirst({
        where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, nextPath)),
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

    return { pageId: page.id, newPath: nextPath };
  });
  if (result.newPath !== currentPath) await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(result.pageId, ctx);
  return result;
}

export async function getForEdit(ctx: PermCtx, path: string): Promise<EditableView | null> {
  const userId = getUserId(ctx);
  const space = await getDefaultSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;

  const isAuthor = userId ? page.authorId === userId : false;
  if (!can(ctx, 'edit', { kind: 'page', pageId: page.id }, { isAuthor })) {
    return null;
  }

  const revision = page.latestVersionId
    ? await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, page.latestVersionId),
      })
    : null;

  if (!revision) return null;

  const isRevisionAuthor = userId ? revision.authorId === userId : false;
  const canPublish = can(
    ctx,
    'publish',
    { kind: 'revision', pageId: page.id, version: revision.versionNumber },
    { isAuthor: isRevisionAuthor },
  );

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
  };
}

export async function getHistory(ctx: PermCtx, path: string): Promise<RevisionSummary[]> {
  const userId = getUserId(ctx);
  const space = await getDefaultSpace();
  if (!space) return [];

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return [];

  const isAuthor = userId ? page.authorId === userId : false;
  const canSeeDrafts = can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, { isAuthor });

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
        { isAuthor },
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
  const space = await getDefaultSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
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
  if (revision.status === 'draft' && !can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version }, { isAuthor })) {
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
