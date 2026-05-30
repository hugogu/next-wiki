import { eq, and, inArray, ilike, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { tags, pageTags, pages } from "@/server/db/schema/wiki";
import type { PermissionContext } from "@/server/services/permissions/context";
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tag = typeof tags.$inferSelect;

export type CreateTagInput = {
  slug: string;
  label: string;
  description?: string;
  colorToken?: string;
};

export type UpdateTagInput = {
  label?: string;
  description?: string;
  colorToken?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function validateSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      "Tag slug must only contain lowercase letters, digits, and hyphens",
      { slug: ["Must match pattern /^[a-z0-9-]+$/"] },
    );
  }
}

async function findTagBySlug(slug: string): Promise<Tag | undefined> {
  const db = getDb();
  const rows = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create a new tag. Requires site admin.
 */
export async function createTag(
  input: CreateTagInput,
  actor: PermissionContext,
): Promise<Tag> {
  if (!actor.isAdmin) {
    throw new ForbiddenError("create tag");
  }

  validateSlug(input.slug);

  const existing = await findTagBySlug(input.slug);
  if (existing) {
    throw new ConflictError(`Tag with slug '${input.slug}' already exists`);
  }

  const db = getDb();
  const [tag] = await db
    .insert(tags)
    .values({
      slug: input.slug,
      label: input.label,
      description: input.description,
      colorToken: input.colorToken,
    })
    .returning();

  return tag;
}

/**
 * Get a single tag by slug.
 */
export async function getTag(slug: string): Promise<Tag> {
  const tag = await findTagBySlug(slug);
  if (!tag) {
    throw new NotFoundError("Tag", slug);
  }
  return tag;
}

/**
 * List all tags. Public — no permission check required.
 */
export async function listTags(opts?: { q?: string; limit?: number }): Promise<Tag[]> {
  const db = getDb();
  let query = db.select().from(tags).$dynamic();

  if (opts?.q) {
    query = query.where(ilike(tags.label, `%${opts.q}%`));
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  return query;
}

/**
 * Update a tag. Requires site admin.
 */
export async function updateTag(
  slug: string,
  input: UpdateTagInput,
  actor: PermissionContext,
): Promise<Tag> {
  if (!actor.isAdmin) {
    throw new ForbiddenError("update tag");
  }

  const existing = await findTagBySlug(slug);
  if (!existing) {
    throw new NotFoundError("Tag", slug);
  }

  const db = getDb();
  const [updated] = await db
    .update(tags)
    .set({
      ...(input.label !== undefined && { label: input.label }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.colorToken !== undefined && { colorToken: input.colorToken }),
      updatedAt: new Date(),
    })
    .where(eq(tags.id, existing.id))
    .returning();

  return updated;
}

/**
 * Delete a tag. Requires site admin.
 * All page_tags records referencing this tag are removed via ON DELETE CASCADE.
 */
export async function deleteTag(slug: string, actor: PermissionContext): Promise<void> {
  if (!actor.isAdmin) {
    throw new ForbiddenError("delete tag");
  }

  const existing = await findTagBySlug(slug);
  if (!existing) {
    throw new NotFoundError("Tag", slug);
  }

  const db = getDb();
  await db.delete(tags).where(eq(tags.id, existing.id));
}

/**
 * Set the tags for a page (replace, not append).
 * Runs inside a transaction: deletes existing page_tags, then inserts new ones.
 */
export async function setPageTags(
  pageId: string,
  tagSlugs: string[],
  assignedByUserId: string | null,
): Promise<void> {
  const db = getDb();

  // Resolve tag slugs to IDs
  let resolvedTagIds: string[] = [];
  if (tagSlugs.length > 0) {
    const found = await db
      .select({ id: tags.id, slug: tags.slug })
      .from(tags)
      .where(inArray(tags.slug, tagSlugs));

    const foundSlugs = new Set(found.map((t) => t.slug));
    const missing = tagSlugs.filter((s) => !foundSlugs.has(s));
    if (missing.length > 0) {
      throw new NotFoundError("Tag", missing.join(", "));
    }

    resolvedTagIds = found.map((t) => t.id);
  }

  await db.transaction(async (tx) => {
    // Remove all existing tags for the page
    await tx.delete(pageTags).where(eq(pageTags.pageId, pageId));

    // Insert new tags
    if (resolvedTagIds.length > 0) {
      await tx.insert(pageTags).values(
        resolvedTagIds.map((tagId) => ({
          pageId,
          tagId,
          assignedByUserId,
        })),
      );
    }
  });
}

/**
 * Get tags assigned to a page.
 */
export async function getPageTags(pageId: string): Promise<Tag[]> {
  const db = getDb();
  const rows = await db
    .select({ tag: tags })
    .from(pageTags)
    .innerJoin(tags, eq(pageTags.tagId, tags.id))
    .where(eq(pageTags.pageId, pageId));

  return rows.map((r) => r.tag);
}

/**
 * Get page IDs filtered by tag slugs (all slugs must match — AND logic).
 * Optionally scope to a specific space.
 */
export async function getPageIdsByTagSlugs(
  tagSlugs: string[],
  spaceId?: string,
): Promise<string[]> {
  if (tagSlugs.length === 0) {
    return [];
  }

  const db = getDb();

  // Resolve slugs to IDs first
  const found = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.slug, tagSlugs));

  if (found.length !== tagSlugs.length) {
    // Some tags don't exist — no pages can match all of them
    return [];
  }

  const tagIds = found.map((t) => t.id);

  // Find pages that have ALL of the requested tags (AND logic) using GROUP BY + HAVING COUNT
  const rows = await db
    .select({ pageId: pageTags.pageId })
    .from(pageTags)
    .innerJoin(pages, eq(pageTags.pageId, pages.id))
    .where(
      spaceId
        ? and(inArray(pageTags.tagId, tagIds), eq(pages.spaceId, spaceId))
        : inArray(pageTags.tagId, tagIds),
    )
    .groupBy(pageTags.pageId)
    .having(sql`COUNT(DISTINCT ${pageTags.tagId}) = ${tagIds.length}`);

  return rows.map((r) => r.pageId);
}
