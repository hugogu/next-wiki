import { eq, and } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { groups, groupMemberships, users } from "@/server/db/schema/auth";
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Group = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
};

export type User = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  preferredLocale: string;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Row → type mappers
// ---------------------------------------------------------------------------

function toGroup(row: typeof groups.$inferSelect): Group {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? null,
    isSystem: row.isSystem,
    createdAt: row.createdAt,
  };
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email ?? null,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    status: row.status,
    preferredLocale: row.preferredLocale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * List all groups. Admin only.
 */
export async function listGroups(actor: PermissionContext): Promise<Group[]> {
  if (!actor.isAdmin) throw new ForbiddenError("list groups");

  const db = getDb();
  const rows = await db.select().from(groups);
  return rows.map(toGroup);
}

/**
 * Create a new group. Admin only.
 */
export async function createGroup(
  input: { key: string; name: string; description?: string },
  actor: PermissionContext,
): Promise<Group> {
  if (!actor.isAdmin) throw new ForbiddenError("create group");

  const db = getDb();

  const existing = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.key, input.key))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Group with key '${input.key}' already exists`);
  }

  const [row] = await db
    .insert(groups)
    .values({
      key: input.key,
      name: input.name,
      description: input.description,
      isSystem: false,
    })
    .returning();

  return toGroup(row);
}

/**
 * Update a group's name or description. Admin only.
 * System groups cannot have their key changed (key is never changed here).
 */
export async function updateGroup(
  groupId: string,
  input: { name?: string; description?: string },
  actor: PermissionContext,
): Promise<Group> {
  if (!actor.isAdmin) throw new ForbiddenError("update group");

  const db = getDb();

  const rows = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (rows.length === 0) throw new NotFoundError("Group", groupId);

  const updates: Partial<typeof groups.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;

  const [updated] = await db
    .update(groups)
    .set(updates)
    .where(eq(groups.id, groupId))
    .returning();

  return toGroup(updated);
}

/**
 * Delete a group. Admin only. System groups cannot be deleted.
 */
export async function deleteGroup(groupId: string, actor: PermissionContext): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError("delete group");

  const db = getDb();

  const rows = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (rows.length === 0) throw new NotFoundError("Group", groupId);

  const group = rows[0];
  if (group.isSystem) {
    throw new ValidationError(`System group '${group.key}' cannot be deleted`);
  }

  await db.delete(groups).where(eq(groups.id, groupId));
}

/**
 * Add a user to a group. Admin only. Idempotent.
 */
export async function addGroupMember(
  groupId: string,
  userId: string,
  actor: PermissionContext,
): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError("add group member");

  const db = getDb();

  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (groupRows.length === 0) throw new NotFoundError("Group", groupId);

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRows.length === 0) throw new NotFoundError("User", userId);

  await db
    .insert(groupMemberships)
    .values({ userId, groupId })
    .onConflictDoNothing();
}

/**
 * Remove a user from a group. Admin only.
 */
export async function removeGroupMember(
  groupId: string,
  userId: string,
  actor: PermissionContext,
): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError("remove group member");

  const db = getDb();

  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (groupRows.length === 0) throw new NotFoundError("Group", groupId);

  await db
    .delete(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.groupId, groupId),
      ),
    );
}

/**
 * List all members of a group. Admin only.
 */
export async function listGroupMembers(groupId: string, actor: PermissionContext): Promise<User[]> {
  if (!actor.isAdmin) throw new ForbiddenError("list group members");

  const db = getDb();

  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (groupRows.length === 0) throw new NotFoundError("Group", groupId);

  const rows = await db
    .select({ user: users })
    .from(groupMemberships)
    .innerJoin(users, eq(groupMemberships.userId, users.id))
    .where(eq(groupMemberships.groupId, groupId));

  return rows.map((r) => toUser(r.user));
}
