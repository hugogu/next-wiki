import { eq, and } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pageRedirects } from "@/server/db/schema/wiki";
import type { PermissionContext } from "@/server/services/permissions/context";
import { ForbiddenError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Redirect = {
  fromPath: string;
  toPath: string;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Follow a chain of redirects for a given toPath until we reach a path that
 * has no further redirect. Returns the final destination path.
 * Protects against cycles with a max-hop limit.
 */
async function resolveChain(
  spaceId: string,
  startPath: string,
  maxHops = 20,
): Promise<string> {
  const db = getDb();
  let current = startPath;

  for (let i = 0; i < maxHops; i++) {
    const rows = await db
      .select({ toPath: pageRedirects.toPath })
      .from(pageRedirects)
      .where(and(eq(pageRedirects.spaceId, spaceId), eq(pageRedirects.fromPath, current)))
      .limit(1);

    if (rows.length === 0) {
      break;
    }

    current = rows[0]!.toPath;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create or update a redirect from `fromPath` to `toPath` within a space.
 *
 * Chain-resolution rules applied at write time:
 *   1. Resolve the final destination of `toPath` (follow any existing redirect
 *      chain) so we never store a redirect that points to another redirect.
 *   2. Update any existing redirect whose `toPath` equals `fromPath` so it
 *      points directly at the new final destination (avoids growing chains).
 */
export async function createRedirect(
  spaceId: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const db = getDb();

  // Step 1: Resolve the final destination of toPath
  const finalTarget = await resolveChain(spaceId, toPath);

  // Step 2: Update any existing redirect whose toPath points at fromPath
  // (they were previously redirected to fromPath; now route them to finalTarget)
  await db
    .update(pageRedirects)
    .set({ toPath: finalTarget })
    .where(and(eq(pageRedirects.spaceId, spaceId), eq(pageRedirects.toPath, fromPath)));

  // Step 3: Upsert the new redirect (fromPath → finalTarget)
  const existing = await db
    .select({ id: pageRedirects.id })
    .from(pageRedirects)
    .where(and(eq(pageRedirects.spaceId, spaceId), eq(pageRedirects.fromPath, fromPath)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pageRedirects)
      .set({ toPath: finalTarget })
      .where(eq(pageRedirects.id, existing[0]!.id));
  } else {
    await db.insert(pageRedirects).values({
      spaceId,
      fromPath,
      toPath: finalTarget,
    });
  }
}

/**
 * Remove the redirect for a path. Called when a new page is created at a
 * path that was previously a redirect source (the page takes precedence).
 */
export async function removeRedirectForPath(spaceId: string, path: string): Promise<void> {
  const db = getDb();
  await db
    .delete(pageRedirects)
    .where(and(eq(pageRedirects.spaceId, spaceId), eq(pageRedirects.fromPath, path)));
}

/**
 * Resolve a redirect: return the target path if a redirect exists, otherwise null.
 */
export async function resolveRedirect(
  spaceId: string,
  fromPath: string,
): Promise<{ toPath: string } | null> {
  const db = getDb();
  const rows = await db
    .select({ toPath: pageRedirects.toPath })
    .from(pageRedirects)
    .where(and(eq(pageRedirects.spaceId, spaceId), eq(pageRedirects.fromPath, fromPath)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return { toPath: rows[0]!.toPath };
}

/**
 * List all redirects in a space. Requires admin.
 */
export async function listRedirects(
  spaceId: string,
  actor: PermissionContext,
): Promise<Redirect[]> {
  if (!actor.isAdmin) {
    throw new ForbiddenError("list redirects");
  }

  const db = getDb();
  const rows = await db
    .select({
      fromPath: pageRedirects.fromPath,
      toPath: pageRedirects.toPath,
      createdAt: pageRedirects.createdAt,
    })
    .from(pageRedirects)
    .where(eq(pageRedirects.spaceId, spaceId));

  return rows;
}
