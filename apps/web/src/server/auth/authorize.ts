import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import type { PermissionContext } from "@/server/services/permissions/context";
import { ForbiddenError } from "@next-wiki/shared";

/**
 * Require an authenticated session for server components and layouts.
 * Redirects to /login if unauthenticated.
 */
export async function requireAuth(callbackUrl?: string): Promise<{
  userId: string;
  displayName: string;
}> {
  const session = await getSession();
  if (!session) {
    const loginUrl = callbackUrl
      ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/login";
    redirect(loginUrl);
  }
  return {
    userId: session.user.id,
    displayName: session.user.displayName,
  };
}

/**
 * Require admin group membership.
 * Redirects to login if unauthenticated; throws ForbiddenError if not admin.
 */
export async function requireAdmin(): Promise<PermissionContext> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { buildPermissionContext } = await import("@/server/auth/session");
  const ctx = await buildPermissionContext(session.user.id);

  if (!ctx.isAdmin) {
    throw new ForbiddenError("admin access");
  }
  return ctx;
}

/**
 * Verify an API token from the Authorization header.
 * Returns the permission context for token-based access.
 */
export async function verifyApiToken(
  authHeader: string | null,
): Promise<PermissionContext | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const rawToken = authHeader.slice(7);

  const { validateApiToken } = await import(
    "@/server/services/admin/api-token-service"
  );
  const tokenRecord = await validateApiToken(rawToken);
  if (!tokenRecord) return null;

  return {
    kind: "token",
    userId: tokenRecord.createdByUserId,
    groupIds: [],
    tokenScopes: tokenRecord.scopeSet,
    isAdmin: tokenRecord.scopeSet.includes("admin"),
  };
}
