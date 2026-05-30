import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { spaces, permissionRules } from "@/server/db/schema/wiki";
import type { PermissionContext } from "@/server/services/permissions/context";
import { assertPermission, checkPermission } from "@/server/services/permissions/engine";
import { NotFoundError, ConflictError, ForbiddenError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateSpaceInput = {
  key: string;
  name: string;
  description?: string;
  defaultLocale?: string;
  isPublicByDefault?: boolean;
  navigationMode?: "tree" | "flat";
};

export type UpdateSpaceInput = {
  name?: string;
  description?: string;
  defaultLocale?: string;
  isPublicByDefault?: boolean;
  navigationMode?: "tree" | "flat";
};

export type Space = typeof spaces.$inferSelect;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSpaceRules(spaceId: string) {
  const db = getDb();
  return db
    .select()
    .from(permissionRules)
    .where(eq(permissionRules.resourceId, spaceId));
}

async function findSpaceByKey(key: string): Promise<Space | undefined> {
  const db = getDb();
  const rows = await db.select().from(spaces).where(eq(spaces.key, key)).limit(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create a new space. Requires site admin.
 */
export async function createSpace(
  input: CreateSpaceInput,
  actor: PermissionContext,
): Promise<Space> {
  if (!actor.isAdmin) {
    throw new ForbiddenError("create space");
  }

  const db = getDb();

  // Check key uniqueness
  const existing = await findSpaceByKey(input.key);
  if (existing) {
    throw new ConflictError(`Space with key '${input.key}' already exists`);
  }

  const [space] = await db
    .insert(spaces)
    .values({
      key: input.key,
      name: input.name,
      description: input.description,
      defaultLocale: input.defaultLocale ?? "en",
      isPublicByDefault: input.isPublicByDefault ?? false,
      navigationMode: input.navigationMode ?? "tree",
    })
    .returning();

  return space;
}

/**
 * Get a space by its key. Checks read permission.
 */
export async function getSpace(
  spaceKey: string,
  actor: PermissionContext,
): Promise<Space> {
  const space = await findSpaceByKey(spaceKey);
  if (!space) {
    throw new NotFoundError("Space", spaceKey);
  }

  const rules = await getSpaceRules(space.id);
  assertPermission({
    actor,
    action: "read",
    resourceType: "space",
    resourceId: space.id,
    rules: rules.map((r) => ({
      subjectType: r.subjectType as "user" | "group",
      subjectId: r.subjectId,
      resourceType: r.resourceType as "space",
      resourceId: r.resourceId,
      action: r.action as "read",
      effect: r.effect as "allow" | "deny",
    })),
    spaceDefaultAllowed: space.isPublicByDefault,
    globalDefaultAllowed: actor.isAdmin,
  });

  return space;
}

/**
 * List all spaces the actor has read access to.
 */
export async function listSpaces(actor: PermissionContext): Promise<Space[]> {
  const db = getDb();
  const allSpaces = await db.select().from(spaces);

  // Fetch all space-level permission rules in one query
  const rules = await db.select().from(permissionRules).where(
    eq(permissionRules.resourceType, "space"),
  );

  return allSpaces.filter((space) => {
    const spaceRules = rules
      .filter((r) => r.resourceId === space.id || r.resourceId === null)
      .map((r) => ({
        subjectType: r.subjectType as "user" | "group",
        subjectId: r.subjectId,
        resourceType: r.resourceType as "space",
        resourceId: r.resourceId,
        action: r.action as "read",
        effect: r.effect as "allow" | "deny",
      }));

    return checkPermission({
      actor,
      action: "read",
      resourceType: "space",
      resourceId: space.id,
      rules: spaceRules,
      spaceDefaultAllowed: space.isPublicByDefault,
      globalDefaultAllowed: actor.isAdmin,
    });
  });
}

/**
 * Update a space's metadata. Requires manage permission on the space.
 */
export async function updateSpace(
  spaceKey: string,
  input: UpdateSpaceInput,
  actor: PermissionContext,
): Promise<Space> {
  const space = await findSpaceByKey(spaceKey);
  if (!space) {
    throw new NotFoundError("Space", spaceKey);
  }

  const rules = await getSpaceRules(space.id);
  assertPermission({
    actor,
    action: "manage",
    resourceType: "space",
    resourceId: space.id,
    rules: rules.map((r) => ({
      subjectType: r.subjectType as "user" | "group",
      subjectId: r.subjectId,
      resourceType: r.resourceType as "space",
      resourceId: r.resourceId,
      action: r.action as "manage",
      effect: r.effect as "allow" | "deny",
    })),
    globalDefaultAllowed: actor.isAdmin,
  });

  const db = getDb();
  const [updated] = await db
    .update(spaces)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.defaultLocale !== undefined && { defaultLocale: input.defaultLocale }),
      ...(input.isPublicByDefault !== undefined && {
        isPublicByDefault: input.isPublicByDefault,
      }),
      ...(input.navigationMode !== undefined && { navigationMode: input.navigationMode }),
      updatedAt: new Date(),
    })
    .where(eq(spaces.id, space.id))
    .returning();

  return updated;
}

/**
 * Delete a space. Requires admin. Hard delete for now; soft delete in Phase 4.
 */
export async function deleteSpace(
  spaceKey: string,
  actor: PermissionContext,
): Promise<void> {
  if (!actor.isAdmin) {
    throw new ForbiddenError("delete space");
  }

  const space = await findSpaceByKey(spaceKey);
  if (!space) {
    throw new NotFoundError("Space", spaceKey);
  }

  const db = getDb();
  await db.delete(spaces).where(eq(spaces.id, space.id));
}
