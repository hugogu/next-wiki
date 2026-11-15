import { and, eq, inArray, isNotNull, isNull, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import type { PublicPageNavigationQuery, PublicPageTreeNode, PublicPageTreeResponse } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, can, getActorUserId, pagePermissionOptions, spacePermissionOptions, type PermCtx } from '@/server/permissions';
import { PUBLIC_CONTENT_CACHE_TAG, shouldUseDataCache } from '@/server/cache/public-cache';
import { getAncestorPaths, type LazyPublicPageTreeNode } from '@/lib/page-tree';
import { resolveSpace, type SpaceRow } from './spaces';
import { assertSpaceKindAllowed } from './writing-mode';

function node(path: string): LazyPublicPageTreeNode {
  return { path, segment: path.split('/').at(-1) ?? '', title: null, pageId: null, slug: null, status: null, hasChildren: false, children: [] };
}

// Build the SQL predicate from the permission policy itself, including ownership
// and API-key scopes. Aggregation must never disclose folders containing only
// unreadable pages, and must not transfer every descendant to the app server.
function readablePages(ctx: PermCtx, space: SpaceRow, status: 'published' | 'all'): SQL {
  const variants: SQL[] = [];
  const userId = getActorUserId(ctx);
  for (const visibility of ['public', 'registered', 'restricted'] as const) {
    const options = pagePermissionOptions(space, { visibility });
    if (!can(ctx, 'read', { kind: 'page', pageId: '' }, options)) continue;
    variants.push(and(eq(schema.pages.visibility, visibility), isNotNull(schema.pages.currentPublishedVersionId))!);
    if (status !== 'all') continue;
    const draftConditions: SQL[] = [];
    if (can(ctx, 'read_draft', { kind: 'revision', pageId: '', version: 0 }, options)) {
      draftConditions.push(sql`true`);
    } else if (userId && can(ctx, 'read_draft', { kind: 'revision', pageId: '', version: 0 }, { ...options, isAuthor: true })) {
      draftConditions.push(eq(schema.pages.authorId, userId));
    }
    if (draftConditions.length) {
      variants.push(and(eq(schema.pages.visibility, visibility), isNull(schema.pages.currentPublishedVersionId), or(...draftConditions))!);
    }
  }
  return and(eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt), ne(schema.pages.kind, 'link'), or(...variants) ?? sql`false`)!;
}

async function readableSpace(ctx: PermCtx, slug?: string) {
  const space = await resolveSpace(slug);
  if (!space) return null;
  await assertSpaceKindAllowed(space.kind);
  return can(ctx, 'read', { kind: 'page_list' }, spacePermissionOptions(space)) ? space : null;
}

async function pageNodes(condition: SQL, paths: string[]) {
  if (!paths.length) return [];
  return db.select({
    pageId: schema.pages.id, path: schema.pages.path, slug: schema.pages.slug,
    title: schema.pages.title,
    status: sql<'published' | 'draft'>`case when ${schema.pages.currentPublishedVersionId} is null then 'draft' else 'published' end`,
  }).from(schema.pages).where(and(condition, inArray(schema.pages.path, paths)));
}

/** One level per expanded directory; Postgres returns groups, never descendants. */
export async function getPageNavigation(ctx: PermCtx, query: PublicPageNavigationQuery): Promise<PublicPageTreeResponse> {
  const root = node(query.mode === 'current' ? query.path : '');
  const space = await readableSpace(ctx, query.space);
  if (!space) return { root, pageCount: 0 };
  const condition = readablePages(ctx, space, query.status);
  const directories = query.mode === 'current' ? [query.path] : ['', ...getAncestorPaths(query.path)];
  const levels = await Promise.all(directories.map(async (prefix) => {
    const childPath = prefix
      ? sql<string>`${prefix + '/'} || split_part(substr(${schema.pages.path}, ${Array.from(prefix).length + 2}), '/', 1)`
      : sql<string>`split_part(${schema.pages.path}, '/', 1)`;
    const scope = prefix
      ? like(schema.pages.path, `${prefix.replace(/[\\%_]/g, (char) => `\\${char}`)}/%`)
      : undefined;
    const rows = await db.select({
      path: childPath.as('child_path'),
      hasChildren: sql<boolean>`bool_or(${schema.pages.path} <> ${childPath})`,
    }).from(schema.pages).where(and(condition, scope)).groupBy(sql`child_path`).orderBy(sql`child_path`);
    return { prefix, children: rows.map((row) => ({ ...node(row.path), hasChildren: row.hasChildren })) };
  }));
  const metadata = new Map((await pageNodes(condition, levels.flatMap((level) => level.children.map((child) => child.path))))
    .map((row) => [row.path, row]));
  const nodes = new Map<string, LazyPublicPageTreeNode>([[root.path, root]]);
  for (const level of levels) {
    const parent = nodes.get(level.prefix);
    if (!parent) continue;
    parent.hasChildren = level.children.length > 0;
    parent.children = level.children.map((child) => Object.assign(child, metadata.get(child.path)));
    for (const child of parent.children) nodes.set(child.path, child);
  }
  return { root, pageCount: metadata.size };
}

/** Exact ancestor lookup, independent of wiki size and navigation preference. */
export async function getPageBreadcrumbs(ctx: PermCtx, path: string, slug?: string): Promise<PublicPageTreeNode[]> {
  const space = await readableSpace(ctx, slug);
  if (!space) return [];
  const paths = getAncestorPaths(path);
  const rows = new Map((await pageNodes(readablePages(ctx, space, ctx.actor.kind === 'anonymous' ? 'published' : 'all'), paths))
    .map((row) => [row.path, row]));
  return paths.map((path) => ({ ...node(path), ...rows.get(path) }));
}

const cachedNavigation = unstable_cache(
  (query: PublicPageNavigationQuery) => getPageNavigation(buildAnonymousCtx(), query),
  ['published-page-navigation'], { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);
const cachedBreadcrumbs = unstable_cache(
  (path: string, space?: string) => getPageBreadcrumbs(buildAnonymousCtx(), path, space),
  ['published-page-breadcrumbs'], { revalidate: 300, tags: [PUBLIC_CONTENT_CACHE_TAG] },
);

export function getCachedPageNavigation(query: PublicPageNavigationQuery) {
  // Only the anonymous projection can enter the shared cache.
  const publicQuery = { ...query, status: 'published' as const };
  return shouldUseDataCache() ? cachedNavigation(publicQuery) : getPageNavigation(buildAnonymousCtx(), publicQuery);
}

export function getCachedPageBreadcrumbs(path: string, space?: string) {
  return shouldUseDataCache() ? cachedBreadcrumbs(path, space) : getPageBreadcrumbs(buildAnonymousCtx(), path, space);
}
