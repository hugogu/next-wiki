import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import type { LivePage, PageSummary } from '@next-wiki/shared';

const DEFAULT_SPACE_SLUG = 'default';

async function getDefaultSpace() {
  return db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
}

export async function listPublished(ctx: PermCtx): Promise<PageSummary[]> {
  const space = await getDefaultSpace();
  if (!space) return [];

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return [];
  }

  const rows = await db
    .select({
      slug: schema.pages.slug,
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
    .orderBy(schema.pages.updatedAt);

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    authorDisplayName: r.authorDisplayName,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getLive(ctx: PermCtx, slug: string): Promise<LivePage | null> {
  const space = await getDefaultSpace();
  if (!space) return null;

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return null;
  }

  const [row] = await db
    .select({
      slug: schema.pages.slug,
      title: schema.pages.title,
      contentHtml: schema.pageRevisions.contentHtml,
      contentHash: schema.pageRevisions.contentHash,
      version: schema.pageRevisions.versionNumber,
      publishedAt: schema.pageRevisions.publishedAt,
      authorDisplayName: schema.users.displayName,
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.slug, slug),
        isNull(schema.pages.deletedAt),
      ),
    );

  if (!row) return null;

  return {
    slug: row.slug,
    title: row.title,
    contentHtml: row.contentHtml,
    contentHash: row.contentHash,
    version: row.version,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    authorDisplayName: row.authorDisplayName,
  };
}
