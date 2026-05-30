import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pages, pageRevisions, spaces } from "@/server/db/schema/wiki";
import { NotFoundError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a locale code to the appropriate PostgreSQL FTS configuration name.
 * Chinese and Japanese use 'simple' because PostgreSQL does not have CJK
 * tokenisers built in; all other locales fall back to 'english'.
 */
function ftsConfig(locale: string): "simple" | "english" {
  const lang = locale.toLowerCase().split("-")[0];
  if (lang === "zh" || lang === "ja") {
    return "simple";
  }
  return "english";
}

// ---------------------------------------------------------------------------
// indexPage
// ---------------------------------------------------------------------------

/**
 * Rebuild the search_vector for a single page.
 *
 * Called by the save-page job handler after a page is persisted.
 * Combines title (weight A), summary (weight B), and the source content
 * of the latest revision (weight C) into a single tsvector stored on the
 * pages row.
 */
export async function indexPage(pageId: string): Promise<void> {
  const db = getDb();

  // 1. Load the page with its locale and title/summary.
  const pageRows = await db
    .select({
      id: pages.id,
      locale: pages.locale,
      title: pages.title,
      summary: pages.summary,
      currentRevisionId: pages.currentRevisionId,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  if (pageRows.length === 0) {
    throw new NotFoundError("Page", pageId);
  }

  const page = pageRows[0];

  // 2. Load the source content from the current (latest) revision.
  let sourceContent = "";

  if (page.currentRevisionId) {
    const revRows = await db
      .select({ sourceContent: pageRevisions.sourceContent })
      .from(pageRevisions)
      .where(eq(pageRevisions.id, page.currentRevisionId))
      .limit(1);

    if (revRows.length > 0) {
      sourceContent = revRows[0].sourceContent;
    }
  } else {
    // Fallback: find the highest revision number for this page.
    const latestRevRows = await db
      .select({ sourceContent: pageRevisions.sourceContent })
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, pageId))
      .orderBy(sql`revision_number DESC`)
      .limit(1);

    if (latestRevRows.length > 0) {
      sourceContent = latestRevRows[0].sourceContent;
    }
  }

  // 3. Derive FTS configuration from the page locale.
  const config = ftsConfig(page.locale);

  // 4. Build the weighted tsvector and persist it.
  //
  // We cannot interpolate the config name via a bind parameter because
  // to_tsvector() requires a regconfig literal, not a text value.
  // We use a CASE expression inside SQL so the config name is always a
  // compile-time literal chosen by our own logic — no user input reaches it.
  //
  // All content values are parameterised to prevent SQL injection.
  const searchVector =
    config === "simple"
      ? sql`
          setweight(to_tsvector('simple', ${page.title}), 'A') ||
          setweight(to_tsvector('simple', coalesce(${page.summary}, '')), 'B') ||
          setweight(to_tsvector('simple', ${sourceContent}), 'C')
        `
      : sql`
          setweight(to_tsvector('english', ${page.title}), 'A') ||
          setweight(to_tsvector('english', coalesce(${page.summary}, '')), 'B') ||
          setweight(to_tsvector('english', ${sourceContent}), 'C')
        `;

  await db
    .update(pages)
    .set({ searchVector: searchVector as unknown as string })
    .where(eq(pages.id, pageId));
}

// ---------------------------------------------------------------------------
// rebuildSpaceIndex
// ---------------------------------------------------------------------------

/**
 * Rebuild the search index for every page in a space.
 *
 * This is an admin-only batch operation. It calls indexPage() for each
 * page sequentially to keep database load manageable. Returns the number
 * of pages processed.
 */
export async function rebuildSpaceIndex(spaceId: string): Promise<number> {
  const db = getDb();

  // Verify the space exists.
  const spaceRows = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  if (spaceRows.length === 0) {
    throw new NotFoundError("Space", spaceId);
  }

  // Fetch all non-deleted page IDs belonging to this space.
  const pageRows = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.spaceId, spaceId), isNull(pages.deletedAt)));

  let count = 0;
  for (const row of pageRows) {
    await indexPage(row.id);
    count++;
  }

  return count;
}
