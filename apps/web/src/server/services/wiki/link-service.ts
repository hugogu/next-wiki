import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pageLinks, pages, spaces } from "@/server/db/schema/wiki";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkInput = {
  targetSpaceKey: string;
  targetPath: string;
  targetLocale?: string;
  linkText?: string;
};

export type Backlink = {
  sourcePageId: string;
  sourcePath: string;
  sourceSpaceKey: string;
  linkText: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Replace all outbound link records for a given page + revision.
 * Deletes old records for the (sourcePageId, sourceRevisionId) pair, then
 * bulk-inserts the new ones. All links start with status 'unknown'.
 */
export async function upsertPageLinks(
  sourcePageId: string,
  sourceRevisionId: string,
  links: LinkInput[],
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .delete(pageLinks)
      .where(
        and(
          eq(pageLinks.sourcePageId, sourcePageId),
          eq(pageLinks.sourceRevisionId, sourceRevisionId),
        ),
      );

    if (links.length === 0) {
      return;
    }

    await tx.insert(pageLinks).values(
      links.map((link) => ({
        sourcePageId,
        sourceRevisionId,
        targetSpaceKey: link.targetSpaceKey,
        targetPath: link.targetPath,
        targetLocale: link.targetLocale ?? null,
        linkText: link.linkText ?? null,
        status: "unknown",
      })),
    );
  });
}

/**
 * Validate the status of each link record for a given page + revision.
 * Checks whether the target page exists in the database:
 *   - If the target page exists and is not deleted → 'valid'
 *   - Otherwise → 'broken'
 */
export async function validateLinks(
  sourcePageId: string,
  sourceRevisionId: string,
): Promise<void> {
  const db = getDb();

  const links = await db
    .select()
    .from(pageLinks)
    .where(
      and(
        eq(pageLinks.sourcePageId, sourcePageId),
        eq(pageLinks.sourceRevisionId, sourceRevisionId),
      ),
    );

  if (links.length === 0) {
    return;
  }

  // Load all target spaces referenced in this batch
  const uniqueSpaceKeys = [...new Set(links.map((l) => l.targetSpaceKey))];
  const spaceRows = await db
    .select({ id: spaces.id, key: spaces.key })
    .from(spaces)
    .where(inArray(spaces.key, uniqueSpaceKeys));

  const spaceKeyToId = new Map(spaceRows.map((s) => [s.key, s.id]));

  for (const link of links) {
    const targetSpaceId = spaceKeyToId.get(link.targetSpaceKey);

    let status: "valid" | "broken" = "broken";

    if (targetSpaceId) {
      const whereConditions = link.targetLocale
        ? and(
            eq(pages.spaceId, targetSpaceId),
            eq(pages.path, link.targetPath),
            eq(pages.locale, link.targetLocale),
          )
        : and(eq(pages.spaceId, targetSpaceId), eq(pages.path, link.targetPath));

      const targetPages = await db
        .select({ id: pages.id, deletedAt: pages.deletedAt })
        .from(pages)
        .where(whereConditions)
        .limit(1);

      if (targetPages.length > 0 && !targetPages[0]!.deletedAt) {
        status = "valid";
      }
    }

    await db.update(pageLinks).set({ status }).where(eq(pageLinks.id, link.id));
  }
}

/**
 * Get all inbound links (backlinks) pointing to a specific page identified
 * by its space key and path.
 */
export async function getBacklinks(
  targetSpaceKey: string,
  targetPath: string,
): Promise<Backlink[]> {
  const db = getDb();

  const rows = await db
    .select({
      sourcePageId: pageLinks.sourcePageId,
      sourcePath: pages.path,
      sourceSpaceKey: spaces.key,
      linkText: pageLinks.linkText,
      status: pageLinks.status,
    })
    .from(pageLinks)
    .innerJoin(pages, eq(pageLinks.sourcePageId, pages.id))
    .innerJoin(spaces, eq(pages.spaceId, spaces.id))
    .where(
      and(
        eq(pageLinks.targetSpaceKey, targetSpaceKey),
        eq(pageLinks.targetPath, targetPath),
      ),
    );

  return rows;
}

/**
 * Delete all outbound link records for a page. Called when a page is deleted.
 */
export async function deletePageLinks(pageId: string): Promise<void> {
  const db = getDb();
  await db.delete(pageLinks).where(eq(pageLinks.sourcePageId, pageId));
}
