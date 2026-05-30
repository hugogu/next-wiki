import { createHash } from "crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  pages,
  pageRevisions,
  pageRedirects,
  permissionRules,
  spaces,
  tags,
  pageTags,
  translationGroups,
} from "@/server/db/schema/wiki";
import type { PermissionContext } from "@/server/services/permissions/context";
import { assertPermission } from "@/server/services/permissions/engine";
import { enqueueTask } from "@/server/jobs/task-service";
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatePageInput = {
  spaceKey: string;
  path: string;
  locale?: string;
  title: string;
  summary?: string;
  sourceContent: string;
  sourceFormat?: string;
  changeSummary?: string;
  tagSlugs?: string[];
  translationGroupId?: string;
};

export type UpdatePageInput = {
  title?: string;
  summary?: string;
  sourceContent?: string;
  sourceFormat?: string;
  changeSummary?: string;
  tagSlugs?: string[];
  status?: "draft" | "published" | "archived";
};

export type Page = typeof pages.$inferSelect;
export type PageRevision = typeof pageRevisions.$inferSelect;
export type PageRevisionSummary = Omit<PageRevision, "sourceContent">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function getPagePermissionRules(pageId: string, spaceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(permissionRules)
    .where(
      or(
        and(
          eq(permissionRules.resourceType, "page"),
          eq(permissionRules.resourceId, pageId),
        ),
        and(
          eq(permissionRules.resourceType, "space"),
          eq(permissionRules.resourceId, spaceId),
        ),
      ),
    );
  return rows.map((r) => ({
    subjectType: r.subjectType as "user" | "group",
    subjectId: r.subjectId,
    resourceType: r.resourceType as "page" | "space",
    resourceId: r.resourceId,
    action: r.action as "read" | "write" | "delete" | "manage",
    effect: r.effect as "allow" | "deny",
  }));
}

async function findSpaceByKey(key: string) {
  const db = getDb();
  const rows = await db.select().from(spaces).where(eq(spaces.key, key)).limit(1);
  return rows[0];
}

async function getNextRevisionNumber(pageId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ revisionNumber: pageRevisions.revisionNumber })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.revisionNumber))
    .limit(1);
  return rows.length > 0 ? rows[0].revisionNumber + 1 : 1;
}

async function syncTags(pageId: string, tagSlugs: string[], actorUserId: string | null) {
  const db = getDb();

  // Remove existing tags
  await db.delete(pageTags).where(eq(pageTags.pageId, pageId));

  if (tagSlugs.length === 0) return;

  // Upsert tags and get their ids
  for (const slug of tagSlugs) {
    const label = slug.replace(/-/g, " ");
    await db
      .insert(tags)
      .values({ slug, label })
      .onConflictDoNothing();
  }

  const tagRows = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(inArray(tags.slug, tagSlugs));

  if (tagRows.length > 0) {
    await db.insert(pageTags).values(
      tagRows.map((t) => ({
        pageId,
        tagId: t.id,
        assignedByUserId: actorUserId,
      })),
    );
  }
}

async function enqueueSearchIndex(pageId: string, revisionId: string, locale: string) {
  try {
    await enqueueTask("search.index-page", {
      requestedByUserId: null,
      resourceType: "page",
      resourceId: pageId,
      data: { pageId, revisionId, locale },
    });
  } catch {
    // Non-fatal: search index is best-effort
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new page. Creates an initial revision and enqueues a search index job.
 */
export async function createPage(
  input: CreatePageInput,
  actor: PermissionContext,
): Promise<Page> {
  const space = await findSpaceByKey(input.spaceKey);
  if (!space) {
    throw new NotFoundError("Space", input.spaceKey);
  }

  const locale = input.locale ?? "en";
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;

  // Permission check: write on space
  const spaceRules = await db_getSpaceRules(space.id);
  assertPermission({
    actor,
    action: "write",
    resourceType: "space",
    resourceId: space.id,
    rules: spaceRules,
    globalDefaultAllowed: actor.isAdmin,
  });

  const db = getDb();

  // Check for path conflict
  const conflict = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.spaceId, space.id), eq(pages.path, path), eq(pages.locale, locale)))
    .limit(1);
  if (conflict.length > 0) {
    throw new ConflictError(`Page already exists at path '${path}' (locale: ${locale}) in space '${input.spaceKey}'`);
  }

  // Resolve or create translation group
  let translationGroupId = input.translationGroupId ?? null;
  if (!translationGroupId) {
    const [tg] = await db.insert(translationGroups).values({}).returning();
    translationGroupId = tg.id;
  }

  const sourceContent = input.sourceContent;
  const contentHash = hashContent(sourceContent);

  // Insert the page (without currentRevisionId first, update after revision)
  const [page] = await db
    .insert(pages)
    .values({
      spaceId: space.id,
      translationGroupId,
      path,
      locale,
      title: input.title,
      summary: input.summary,
      status: "draft",
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
    })
    .returning();

  // Create first revision
  const revisionNumber = 1;
  const [revision] = await db
    .insert(pageRevisions)
    .values({
      pageId: page.id,
      revisionNumber,
      title: input.title,
      sourceFormat: input.sourceFormat ?? "markdown",
      sourceContent,
      contentHash,
      changeSummary: input.changeSummary,
      authoredByUserId: actor.userId,
    })
    .returning();

  // Set currentRevisionId
  const [updatedPage] = await db
    .update(pages)
    .set({ currentRevisionId: revision.id })
    .where(eq(pages.id, page.id))
    .returning();

  // Sync tags
  if (input.tagSlugs && input.tagSlugs.length > 0) {
    await syncTags(page.id, input.tagSlugs, actor.userId);
  }

  // Enqueue search index
  await enqueueSearchIndex(page.id, revision.id, locale);

  return updatedPage;
}

// Helper used within createPage before db is initialized via getDb()
async function db_getSpaceRules(spaceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(permissionRules)
    .where(
      and(
        eq(permissionRules.resourceType, "space"),
        eq(permissionRules.resourceId, spaceId),
      ),
    );
  return rows.map((r) => ({
    subjectType: r.subjectType as "user" | "group",
    subjectId: r.subjectId,
    resourceType: r.resourceType as "space",
    resourceId: r.resourceId,
    action: r.action as "read" | "write" | "delete" | "manage",
    effect: r.effect as "allow" | "deny",
  }));
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get a page by (spaceKey, path, locale). Returns NotFound if deleted.
 */
export async function getPage(
  spaceKey: string,
  path: string,
  locale: string,
  actor: PermissionContext,
): Promise<Page> {
  const space = await findSpaceByKey(spaceKey);
  if (!space) {
    throw new NotFoundError("Space", spaceKey);
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const db = getDb();

  const rows = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.spaceId, space.id),
        eq(pages.path, normalizedPath),
        eq(pages.locale, locale),
      ),
    )
    .limit(1);

  const page = rows[0];
  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page");
  }

  const rules = await getPagePermissionRules(page.id, space.id);
  assertPermission({
    actor,
    action: "read",
    resourceType: "page",
    resourceId: page.id,
    rules,
    spaceDefaultAllowed: space.isPublicByDefault,
    globalDefaultAllowed: actor.isAdmin,
  });

  return page;
}

/**
 * Get a page by ID.
 */
export async function getPageById(
  pageId: string,
  actor: PermissionContext,
): Promise<Page> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];

  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page", pageId);
  }

  const spaceRows = await db.select().from(spaces).where(eq(spaces.id, page.spaceId)).limit(1);
  const space = spaceRows[0];

  const rules = await getPagePermissionRules(page.id, page.spaceId);
  assertPermission({
    actor,
    action: "read",
    resourceType: "page",
    resourceId: page.id,
    rules,
    spaceDefaultAllowed: space?.isPublicByDefault ?? false,
    globalDefaultAllowed: actor.isAdmin,
  });

  return page;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update page content. Creates a new revision, updates currentRevisionId.
 */
export async function updatePage(
  pageId: string,
  input: UpdatePageInput,
  actor: PermissionContext,
): Promise<Page> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];

  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page", pageId);
  }

  const spaceRows = await db.select().from(spaces).where(eq(spaces.id, page.spaceId)).limit(1);
  const space = spaceRows[0];

  const rules = await getPagePermissionRules(page.id, page.spaceId);
  assertPermission({
    actor,
    action: "write",
    resourceType: "page",
    resourceId: page.id,
    rules,
    globalDefaultAllowed: actor.isAdmin,
  });

  const newTitle = input.title ?? page.title;
  const newContent = input.sourceContent;

  // Only create a new revision if content actually changed
  let newRevisionId = page.currentRevisionId;

  if (newContent !== undefined) {
    const currentRevisionRows = page.currentRevisionId
      ? await db
          .select()
          .from(pageRevisions)
          .where(eq(pageRevisions.id, page.currentRevisionId))
          .limit(1)
      : [];

    const currentRevision = currentRevisionRows[0];
    const newContentHash = hashContent(newContent);

    // Check if content actually changed
    const contentChanged =
      !currentRevision ||
      currentRevision.contentHash !== newContentHash ||
      currentRevision.title !== newTitle;

    if (contentChanged) {
      const revisionNumber = await getNextRevisionNumber(pageId);
      const sourceFormat =
        input.sourceFormat ?? currentRevision?.sourceFormat ?? "markdown";

      const [revision] = await db
        .insert(pageRevisions)
        .values({
          pageId,
          revisionNumber,
          title: newTitle,
          sourceFormat,
          sourceContent: newContent,
          contentHash: newContentHash,
          changeSummary: input.changeSummary,
          authoredByUserId: actor.userId,
        })
        .returning();

      newRevisionId = revision.id;

      // Enqueue search index
      await enqueueSearchIndex(pageId, revision.id, page.locale);
    }
  }

  // Update page metadata
  const updateValues: Partial<typeof pages.$inferInsert> = {
    updatedByUserId: actor.userId,
    updatedAt: new Date(),
    currentRevisionId: newRevisionId ?? undefined,
  };

  if (input.title !== undefined) updateValues.title = input.title;
  if (input.summary !== undefined) updateValues.summary = input.summary;
  if (input.status !== undefined) updateValues.status = input.status;

  const [updatedPage] = await db
    .update(pages)
    .set(updateValues)
    .where(eq(pages.id, pageId))
    .returning();

  // Sync tags if provided
  if (input.tagSlugs !== undefined) {
    await syncTags(pageId, input.tagSlugs, actor.userId);
  }

  return updatedPage;
}

// ---------------------------------------------------------------------------
// Delete / Restore
// ---------------------------------------------------------------------------

/**
 * Soft-delete a page by setting status=deleted and deletedAt=now().
 */
export async function deletePage(
  pageId: string,
  actor: PermissionContext,
): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];

  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page", pageId);
  }

  const rules = await getPagePermissionRules(page.id, page.spaceId);
  assertPermission({
    actor,
    action: "delete",
    resourceType: "page",
    resourceId: page.id,
    rules,
    globalDefaultAllowed: actor.isAdmin,
  });

  await db
    .update(pages)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(pages.id, pageId));
}

/**
 * Restore a soft-deleted page back to draft status.
 */
export async function restorePage(
  pageId: string,
  actor: PermissionContext,
): Promise<Page> {
  const db = getDb();
  // Include deleted pages in query
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];

  if (!page) {
    throw new NotFoundError("Page", pageId);
  }
  if (page.status !== "deleted") {
    throw new ValidationError(`Page is not deleted (current status: ${page.status})`);
  }

  const rules = await getPagePermissionRules(page.id, page.spaceId);
  assertPermission({
    actor,
    action: "write",
    resourceType: "page",
    resourceId: page.id,
    rules,
    globalDefaultAllowed: actor.isAdmin,
  });

  const [restored] = await db
    .update(pages)
    .set({
      status: "draft",
      deletedAt: null,
      updatedAt: new Date(),
      updatedByUserId: actor.userId,
    })
    .where(eq(pages.id, pageId))
    .returning();

  return restored;
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

/**
 * Move a page to a new path and/or space.
 * Creates a PageRedirect from old path to new path.
 * If cross-space, clears page-level permission rules (inherits space defaults).
 */
export async function movePage(
  pageId: string,
  targetPath: string,
  targetSpaceKey: string,
  actor: PermissionContext,
): Promise<Page> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];

  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page", pageId);
  }

  const targetSpace = await findSpaceByKey(targetSpaceKey);
  if (!targetSpace) {
    throw new NotFoundError("Space", targetSpaceKey);
  }

  // Require manage permission on the page
  const rules = await getPagePermissionRules(page.id, page.spaceId);
  assertPermission({
    actor,
    action: "manage",
    resourceType: "page",
    resourceId: page.id,
    rules,
    globalDefaultAllowed: actor.isAdmin,
  });

  const normalizedTargetPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;

  // Check for conflict at target
  if (targetSpace.id === page.spaceId && normalizedTargetPath === page.path) {
    throw new ValidationError("Target path is the same as the current path");
  }

  const conflict = await db
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages.spaceId, targetSpace.id),
        eq(pages.path, normalizedTargetPath),
        eq(pages.locale, page.locale),
      ),
    )
    .limit(1);
  if (conflict.length > 0) {
    throw new ConflictError(
      `Page already exists at '${normalizedTargetPath}' in space '${targetSpaceKey}'`,
    );
  }

  const oldPath = page.path;
  const oldSpaceId = page.spaceId;
  const isCrossSpace = oldSpaceId !== targetSpace.id;

  // Create redirect from old location
  await db
    .insert(pageRedirects)
    .values({
      spaceId: oldSpaceId,
      fromPath: oldPath,
      toPath: normalizedTargetPath,
    })
    .onConflictDoNothing();

  // If cross-space, remove page-level permission rules so page inherits space defaults
  if (isCrossSpace) {
    await db
      .delete(permissionRules)
      .where(
        and(
          eq(permissionRules.resourceType, "page"),
          eq(permissionRules.resourceId, pageId),
        ),
      );
  }

  // Update page location
  const [movedPage] = await db
    .update(pages)
    .set({
      path: normalizedTargetPath,
      spaceId: targetSpace.id,
      updatedAt: new Date(),
      updatedByUserId: actor.userId,
    })
    .where(eq(pages.id, pageId))
    .returning();

  return movedPage;
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

/**
 * List all revisions for a page (without sourceContent for bandwidth).
 */
export async function listPageRevisions(
  pageId: string,
  actor: PermissionContext,
): Promise<PageRevisionSummary[]> {
  // Verify page access first
  await getPageById(pageId, actor);

  const db = getDb();
  const rows = await db
    .select({
      id: pageRevisions.id,
      pageId: pageRevisions.pageId,
      revisionNumber: pageRevisions.revisionNumber,
      title: pageRevisions.title,
      sourceFormat: pageRevisions.sourceFormat,
      contentHash: pageRevisions.contentHash,
      changeSummary: pageRevisions.changeSummary,
      authoredByUserId: pageRevisions.authoredByUserId,
      createdAt: pageRevisions.createdAt,
    })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.revisionNumber));

  return rows;
}

/**
 * Get a single revision with full sourceContent.
 */
export async function getRevision(
  revisionId: string,
  actor: PermissionContext,
): Promise<PageRevision> {
  const db = getDb();
  const rows = await db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.id, revisionId))
    .limit(1);

  const revision = rows[0];
  if (!revision) {
    throw new NotFoundError("PageRevision", revisionId);
  }

  // Verify read access to the page
  await getPageById(revision.pageId, actor);

  return revision;
}

/**
 * Create a new revision from an existing one's content (i.e., restore a revision).
 */
export async function restoreRevision(
  pageId: string,
  revisionId: string,
  actor: PermissionContext,
): Promise<Page> {
  const db = getDb();

  // Verify write access to the page
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];

  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page", pageId);
  }

  const pageRules = await getPagePermissionRules(page.id, page.spaceId);
  assertPermission({
    actor,
    action: "write",
    resourceType: "page",
    resourceId: page.id,
    rules: pageRules,
    globalDefaultAllowed: actor.isAdmin,
  });

  // Get the target revision
  const revRows = await db
    .select()
    .from(pageRevisions)
    .where(and(eq(pageRevisions.id, revisionId), eq(pageRevisions.pageId, pageId)))
    .limit(1);

  const sourceRevision = revRows[0];
  if (!sourceRevision) {
    throw new NotFoundError("PageRevision", revisionId);
  }

  // Create a new revision with the old content
  const revisionNumber = await getNextRevisionNumber(pageId);
  const [newRevision] = await db
    .insert(pageRevisions)
    .values({
      pageId,
      revisionNumber,
      title: sourceRevision.title,
      sourceFormat: sourceRevision.sourceFormat,
      sourceContent: sourceRevision.sourceContent,
      contentHash: sourceRevision.contentHash,
      changeSummary: `Restored from revision #${sourceRevision.revisionNumber}`,
      authoredByUserId: actor.userId,
    })
    .returning();

  // Update page's currentRevisionId and title
  const [updatedPage] = await db
    .update(pages)
    .set({
      currentRevisionId: newRevision.id,
      title: sourceRevision.title,
      updatedAt: new Date(),
      updatedByUserId: actor.userId,
    })
    .where(eq(pages.id, pageId))
    .returning();

  // Enqueue search index
  await enqueueSearchIndex(pageId, newRevision.id, page.locale);

  return updatedPage;
}
