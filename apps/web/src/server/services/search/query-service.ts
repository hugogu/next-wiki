import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { ValidationError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultItem = {
  pageId: string;
  spaceKey: string;
  path: string;
  locale: string;
  title: string;
  summary: string | null;
  excerpt: string;
  rank: number;
  matchedTagSlugs: string[];
};

export type SearchPagesResult = {
  items: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type PagesByTagItem = {
  pageId: string;
  spaceKey: string;
  path: string;
  locale: string;
  title: string;
};

export type PagesByTagResult = {
  items: PagesByTagItem[];
  total: number;
  hasMore: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a locale to the appropriate PostgreSQL FTS configuration name.
 * Chinese and Japanese use 'simple'; everything else uses 'english'.
 */
function ftsConfig(locale: string): "simple" | "english" {
  const lang = locale.toLowerCase().split("-")[0];
  if (lang === "zh" || lang === "ja") {
    return "simple";
  }
  return "english";
}

// ---------------------------------------------------------------------------
// searchPages
// ---------------------------------------------------------------------------

/**
 * Full-text search across published pages.
 *
 * Uses plainto_tsquery() for tolerant query parsing (no special syntax
 * required from the user). Ranks results with ts_rank_cd() and generates
 * snippets with ts_headline(). Permission filtering is simplified:
 * admins see everything; all other actors see only pages in spaces where
 * isPublicByDefault = true (fine-grained ACL is a Phase 4 concern).
 */
export async function searchPages(params: {
  q: string;
  spaceKey?: string;
  locale?: string;
  tagSlugs?: string[];
  page: number;
  limit: number;
  actor: PermissionContext;
}): Promise<SearchPagesResult> {
  const { q, spaceKey, locale, tagSlugs, page, limit, actor } = params;

  // Return an empty result set for blank queries rather than a full table scan.
  if (!q.trim()) {
    return { items: [], total: 0, page, limit, hasMore: false };
  }

  if (page < 1) {
    throw new ValidationError("page must be >= 1");
  }
  if (limit < 1 || limit > 100) {
    throw new ValidationError("limit must be between 1 and 100");
  }

  const db = getDb();
  const offset = (page - 1) * limit;

  // Choose FTS config based on the requested locale (or fall back to english).
  const config: "simple" | "english" = locale ? ftsConfig(locale) : "english";

  // Build SQL fragments for optional filters so the main query stays readable.

  // Space filter
  const spaceFilter = spaceKey
    ? sql`AND s.key = ${spaceKey}`
    : sql``;

  // Locale filter
  const localeFilter = locale
    ? sql`AND p.locale = ${locale}`
    : sql``;

  // Permission filter: non-admins may only see pages in public spaces.
  const permFilter = actor.isAdmin
    ? sql``
    : sql`AND s.is_public_by_default = true`;

  // Tag filter: EXISTS subquery against page_tags + tags.
  const tagFilter =
    tagSlugs && tagSlugs.length > 0
      ? sql`
          AND EXISTS (
            SELECT 1
            FROM page_tags pt
            JOIN tags t ON t.id = pt.tag_id
            WHERE pt.page_id = p.id
              AND t.slug = ANY(${tagSlugs})
          )
        `
      : sql``;

  // ts_headline options — generate a compact excerpt (~200 chars).
  const headlineOpts = "MaxWords=30,MinWords=15,MaxFragments=2";

  // -------------------------------------------------------------------------
  // Count query (separate from the data query for simplicity)
  // -------------------------------------------------------------------------
  const countResult =
    config === "simple"
      ? await db.execute(sql`
          SELECT COUNT(*) AS total
          FROM pages p
          JOIN spaces s ON s.id = p.space_id
          WHERE p.status = 'published'
            AND p.deleted_at IS NULL
            AND p.search_vector IS NOT NULL
            AND p.search_vector @@ plainto_tsquery('simple', ${q})
            ${spaceFilter}
            ${localeFilter}
            ${permFilter}
            ${tagFilter}
        `)
      : await db.execute(sql`
          SELECT COUNT(*) AS total
          FROM pages p
          JOIN spaces s ON s.id = p.space_id
          WHERE p.status = 'published'
            AND p.deleted_at IS NULL
            AND p.search_vector IS NOT NULL
            AND p.search_vector @@ plainto_tsquery('english', ${q})
            ${spaceFilter}
            ${localeFilter}
            ${permFilter}
            ${tagFilter}
        `);

  const total = Number((countResult.rows[0] as { total: string }).total);

  // -------------------------------------------------------------------------
  // Data query
  // -------------------------------------------------------------------------
  const dataResult =
    config === "simple"
      ? await db.execute(sql`
          SELECT
            p.id                                                       AS "pageId",
            s.key                                                      AS "spaceKey",
            p.path,
            p.locale,
            p.title,
            p.summary,
            ts_headline(
              'simple',
              coalesce(p.summary, p.title),
              plainto_tsquery('simple', ${q}),
              ${headlineOpts}
            )                                                          AS excerpt,
            ts_rank_cd(p.search_vector, plainto_tsquery('simple', ${q})) AS rank
          FROM pages p
          JOIN spaces s ON s.id = p.space_id
          WHERE p.status = 'published'
            AND p.deleted_at IS NULL
            AND p.search_vector IS NOT NULL
            AND p.search_vector @@ plainto_tsquery('simple', ${q})
            ${spaceFilter}
            ${localeFilter}
            ${permFilter}
            ${tagFilter}
          ORDER BY rank DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `)
      : await db.execute(sql`
          SELECT
            p.id                                                         AS "pageId",
            s.key                                                        AS "spaceKey",
            p.path,
            p.locale,
            p.title,
            p.summary,
            ts_headline(
              'english',
              coalesce(p.summary, p.title),
              plainto_tsquery('english', ${q}),
              ${headlineOpts}
            )                                                            AS excerpt,
            ts_rank_cd(p.search_vector, plainto_tsquery('english', ${q})) AS rank
          FROM pages p
          JOIN spaces s ON s.id = p.space_id
          WHERE p.status = 'published'
            AND p.deleted_at IS NULL
            AND p.search_vector IS NOT NULL
            AND p.search_vector @@ plainto_tsquery('english', ${q})
            ${spaceFilter}
            ${localeFilter}
            ${permFilter}
            ${tagFilter}
          ORDER BY rank DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

  // -------------------------------------------------------------------------
  // Enrich with matched tag slugs (one extra query per result set)
  // -------------------------------------------------------------------------
  const pageIds = (dataResult.rows as Array<{ pageId: string }>).map((r) => r.pageId);

  let tagsByPage: Map<string, string[]> = new Map();

  if (pageIds.length > 0) {
    const tagRows = await db.execute(sql`
      SELECT pt.page_id AS "pageId", t.slug
      FROM page_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.page_id = ANY(${pageIds})
    `);

    for (const row of tagRows.rows as Array<{ pageId: string; slug: string }>) {
      const existing = tagsByPage.get(row.pageId) ?? [];
      existing.push(row.slug);
      tagsByPage.set(row.pageId, existing);
    }
  }

  const items: SearchResultItem[] = (
    dataResult.rows as Array<{
      pageId: string;
      spaceKey: string;
      path: string;
      locale: string;
      title: string;
      summary: string | null;
      excerpt: string;
      rank: string | number;
    }>
  ).map((row) => ({
    pageId: row.pageId,
    spaceKey: row.spaceKey,
    path: row.path,
    locale: row.locale,
    title: row.title,
    summary: row.summary ?? null,
    excerpt: row.excerpt ?? "",
    rank: typeof row.rank === "string" ? parseFloat(row.rank) : row.rank,
    matchedTagSlugs: tagsByPage.get(row.pageId) ?? [],
  }));

  return {
    items,
    total,
    page,
    limit,
    hasMore: offset + items.length < total,
  };
}

// ---------------------------------------------------------------------------
// getPagesByTag
// ---------------------------------------------------------------------------

/**
 * Return pages associated with a given tag slug, without using FTS.
 *
 * Supports the same permission and locale filters as searchPages, and
 * returns paginated results ordered by page title.
 */
export async function getPagesByTag(
  tagSlug: string,
  opts: {
    spaceKey?: string;
    locale?: string;
    page: number;
    limit: number;
    actor: PermissionContext;
  },
): Promise<PagesByTagResult> {
  const { spaceKey, locale, page, limit, actor } = opts;

  if (page < 1) {
    throw new ValidationError("page must be >= 1");
  }
  if (limit < 1 || limit > 100) {
    throw new ValidationError("limit must be between 1 and 100");
  }

  const db = getDb();
  const offset = (page - 1) * limit;

  const spaceFilter = spaceKey ? sql`AND s.key = ${spaceKey}` : sql``;
  const localeFilter = locale ? sql`AND p.locale = ${locale}` : sql``;
  const permFilter = actor.isAdmin ? sql`` : sql`AND s.is_public_by_default = true`;

  const countResult = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM pages p
    JOIN spaces s ON s.id = p.space_id
    JOIN page_tags pt ON pt.page_id = p.id
    JOIN tags t ON t.id = pt.tag_id
    WHERE t.slug = ${tagSlug}
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      ${spaceFilter}
      ${localeFilter}
      ${permFilter}
  `);

  const total = Number((countResult.rows[0] as { total: string }).total);

  const dataResult = await db.execute(sql`
    SELECT
      p.id    AS "pageId",
      s.key   AS "spaceKey",
      p.path,
      p.locale,
      p.title
    FROM pages p
    JOIN spaces s ON s.id = p.space_id
    JOIN page_tags pt ON pt.page_id = p.id
    JOIN tags t ON t.id = pt.tag_id
    WHERE t.slug = ${tagSlug}
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      ${spaceFilter}
      ${localeFilter}
      ${permFilter}
    ORDER BY p.title ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const items: PagesByTagItem[] = (
    dataResult.rows as Array<{
      pageId: string;
      spaceKey: string;
      path: string;
      locale: string;
      title: string;
    }>
  ).map((row) => ({
    pageId: row.pageId,
    spaceKey: row.spaceKey,
    path: row.path,
    locale: row.locale,
    title: row.title,
  }));

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}
