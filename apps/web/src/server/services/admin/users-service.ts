import { eq, ilike, and, or, count } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users, groupMemberships, groups } from "@/server/db/schema/auth";
import { ForbiddenError, NotFoundError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type Group = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Row → type mappers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * List users with optional search and pagination. Admin only.
 */
export async function listUsers(
  opts: { q?: string; status?: string; page: number; limit: number },
  actor: PermissionContext,
): Promise<{ items: User[]; total: number; hasMore: boolean }> {
  if (!actor.isAdmin) throw new ForbiddenError("list users");

  const db = getDb();
  const { q, status, page, limit } = opts;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) {
    conditions.push(eq(users.status, status));
  }
  if (q && q.trim().length > 0) {
    const pattern = `%${q.trim()}%`;
    conditions.push(
      or(ilike(users.email, pattern), ilike(users.displayName, pattern)),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    items: rows.map(toUser),
    total,
    hasMore: offset + rows.length < total,
  };
}

/**
 * Get a single user by ID. Admin only.
 */
export async function getUser(userId: string, actor: PermissionContext): Promise<User> {
  if (!actor.isAdmin) throw new ForbiddenError("get user");

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (rows.length === 0) throw new NotFoundError("User", userId);

  return toUser(rows[0]);
}

/**
 * Update a user's status (active / suspended). Admin only.
 */
export async function updateUserStatus(
  userId: string,
  status: "active" | "suspended",
  actor: PermissionContext,
): Promise<User> {
  if (!actor.isAdmin) throw new ForbiddenError("update user status");

  const db = getDb();

  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (rows.length === 0) throw new NotFoundError("User", userId);

  const [updated] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return toUser(updated);
}

/**
 * List the groups a user belongs to. Admin only.
 */
export async function getUserGroups(userId: string, actor: PermissionContext): Promise<Group[]> {
  if (!actor.isAdmin) throw new ForbiddenError("get user groups");

  const db = getDb();

  // Verify user exists
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRows.length === 0) throw new NotFoundError("User", userId);

  const rows = await db
    .select({ group: groups })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(eq(groupMemberships.userId, userId));

  return rows.map((r) => toGroup(r.group));
}
