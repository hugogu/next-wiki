import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type {
  PublicAssetResource,
  PublicDraftCreateInput,
  PublicPageCreateInput,
  PublicPageListQuery,
  PublicPageListResponse,
  PublicPagePropertiesInput,
  PublicPageResource,
  PublicPageSearchQuery,
  PublicPageSearchResponse,
  PublicPublicationInput,
  PublicRevisionListQuery,
  PublicRevisionListResponse,
  PublicRevisionResource,
} from '@next-wiki/shared';
import { decodePublicCursor, nextPublicCursor } from '@/server/api/public-pagination';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
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

async function visiblePageResource(ctx: PermCtx, space: { slug: string; anonymousRead: boolean; defaultLocale: string }, page: PageRow): Promise<PublicPageResource | null> {
  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return null;
  }

  const userId = getActorUserId(ctx);
  const isPageAuthor = userId ? page.authorId === userId : false;
  const canSeeDraft = can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, { isAuthor: isPageAuthor });

  const published = (page.currentPublishedVersionId
    ? await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.currentPublishedVersionId) })
    : null) ?? null;
  const latest = (page.latestVersionId
    ? await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.latestVersionId) })
    : null) ?? null;

  if (!published && !canSeeDraft) return null;

  const visibleLatest = (latest && (latest.status === 'published' || canSeeDraft) ? latest : published) ?? null;
  const current = visibleLatest ?? published;
  if (!current) return null;

  return {
    id: page.id,
    spaceSlug: space.slug,
    path: page.path,
    locale: page.locale,
    title: page.title,
    contentSource: await readMarkdownWithFallback(current),
    status: published ? 'published' : 'draft',
    author: await author(page.authorId),
    latestRevision: await revisionSummary(ctx, page, visibleLatest),
    publishedRevision: await revisionSummary(ctx, page, published),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    links: links(page),
  };
}

async function getVisiblePage(ctx: PermCtx, predicate: SQL): Promise<PublicPageResource | null> {
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
  return visiblePageResource(ctx, space, page);
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

async function visibleRevisionResource(ctx: PermCtx, page: PageRow, revision: RevisionRow): Promise<PublicRevisionResource | null> {
  const userId = getActorUserId(ctx);
  const isAuthor = userId ? revision.authorId === userId : false;
  if (revision.status === 'draft' && !can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: revision.versionNumber }, { isAuthor })) {
    return null;
  }
  return {
    ...(await revisionSummary(ctx, page, revision))!,
    contentSource: await readMarkdownWithFallback(revision),
  };
}

export async function listPages(ctx: PermCtx, query: PublicPageListQuery): Promise<PublicPageListResponse> {
  const space = await getDefaultSpace();
  if (!space) return { items: [], nextCursor: null };

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return { items: [], nextCursor: null };
  }

  if (query.path) {
    const page = await getPageByPath(ctx, query.path);
    return { items: page ? [page] : [], nextCursor: null };
  }

  const cursor = decodePublicCursor(query.cursor);
  const rows = await db
    .select({ page: schema.pages })
    .from(schema.pages)
    .leftJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
      ),
    )
    .orderBy(query.order === 'recent' ? desc(schema.pageRevisions.publishedAt) : schema.pages.path)
    .limit(query.limit + 1)
    .offset(cursor.offset);

  const items: PublicPageResource[] = [];
  for (const { page } of rows) {
    if (query.status === 'published' && !page.currentPublishedVersionId) continue;
    const item = await visiblePageResource(ctx, space, page);
    if (!item) continue;
    if (query.status === 'draft' && item.status !== 'draft') continue;
    if (query.q) {
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

export async function getPageById(ctx: PermCtx, id: string): Promise<PublicPageResource | null> {
  return getVisiblePage(ctx, eq(schema.pages.id, id));
}

export async function getPageByPath(ctx: PermCtx, path: string): Promise<PublicPageResource | null> {
  return getVisiblePage(ctx, eq(schema.pages.path, path));
}

export async function createPage(ctx: PermCtx, input: PublicPageCreateInput): Promise<PublicPageResource> {
  const created = await pageService.create(ctx, {
    path: input.path,
    title: input.title,
    contentSource: input.contentSource,
  });
  const page = await getPageById(ctx, created.pageId);
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

export async function updateProperties(ctx: PermCtx, pageId: string, input: PublicPagePropertiesInput): Promise<PublicPageResource> {
  const page = await getPageRowById(pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  const updated = await pageService.updateProperties(ctx, page.path, input);
  const view = await getPageById(ctx, updated.pageId);
  if (!view) throw new DomainError('NOT_FOUND', 'Updated page is not visible');
  return view;
}

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

  const items: PublicRevisionResource[] = [];
  for (const row of rows) {
    if (query.status && query.status !== 'all' && row.status !== query.status) continue;
    const item = await visibleRevisionResource(ctx, page, row);
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

export async function publishRevision(ctx: PermCtx, pageId: string, version: number, input: PublicPublicationInput): Promise<PublicPageResource> {
  const page = await getPageRowById(pageId);
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  await revisionService.publish(ctx, {
    path: page.path,
    version,
    expectedRevisionId: input.expectedRevisionId,
  });
  const view = await getPageById(ctx, page.id);
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
  const pages = await listPages(ctx, {
    status: query.status,
    q: query.q,
    limit: query.limit,
    cursor: query.cursor,
    order: 'recent',
  });
  const q = query.q.toLowerCase();
  return {
    items: pages.items
      .map((page) => {
        const pathMatch = page.path.toLowerCase().includes(q);
        const titleMatch = page.title.toLowerCase().includes(q);
        const contentMatch = page.contentSource?.toLowerCase().includes(q) ?? false;
        const matchType: 'path' | 'title' | 'content' = pathMatch ? 'path' : titleMatch ? 'title' : contentMatch ? 'content' : 'title';
        const excerpt = page.contentSource && contentMatch ? page.contentSource.slice(0, 240) : null;
        return { page, matchType, excerpt, score: null };
      })
      .filter((item) => query.scope === 'all' || item.matchType === query.scope),
    nextCursor: pages.nextCursor,
  };
}
