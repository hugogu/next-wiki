import { headers } from "next/headers";
import { auth } from "./index";
import type { PermissionContext } from "@/server/services/permissions/context";
import { UnauthorizedError } from "@next-wiki/shared";

export type AuthSession = {
  user: {
    id: string;
    email: string | null;
    displayName: string;
    status: string;
  };
  session: { id: string; expiresAt: Date };
};

/**
 * Get the current session from request headers.
 * Returns null when unauthenticated (e.g., anonymous read access).
 */
export async function getSession(): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      displayName: (session.user as { displayName?: string }).displayName ?? session.user.name ?? "User",
      status: (session.user as { status?: string }).status ?? "active",
    },
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
  };
}

/**
 * Require an authenticated session. Throws UnauthorizedError if not signed in.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * Build a PermissionContext from the current session.
 * Group IDs are loaded from the database based on current session user.
 */
export async function buildPermissionContext(
  userId: string | null,
): Promise<PermissionContext> {
  if (!userId) {
    return {
      kind: "user",
      userId: null,
      groupIds: [],
      tokenScopes: [],
      isAdmin: false,
    };
  }

  const { getDb } = await import("@/server/db/client");
  const db = getDb();
  const rows = await db.execute(
    `SELECT gm.group_id, g.key
     FROM group_memberships gm
     JOIN groups g ON g.id = gm.group_id
     WHERE gm.user_id = $1`,
    [userId],
  );

  const groupIds = (rows.rows as Array<{ group_id: string; key: string }>).map(
    (r) => r.group_id,
  );
  const isAdmin = (rows.rows as Array<{ key: string }>).some(
    (r) => r.key === "administrators",
  );

  return {
    kind: "user",
    userId,
    groupIds,
    tokenScopes: [],
    isAdmin,
  };
}
