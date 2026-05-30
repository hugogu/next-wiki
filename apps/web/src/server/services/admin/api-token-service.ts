import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { apiTokens } from "@/server/db/schema/auth";
import { ForbiddenError, NotFoundError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatedApiToken = {
  token: string;
  id: string;
  label: string;
  createdAt: Date;
};

export type ApiTokenSummary = {
  id: string;
  label: string;
  scopeSet: string[];
  status: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type ValidatedApiToken = {
  id: string;
  scopeSet: string[];
  createdByUserId: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create a new API token. Returns the plaintext token exactly once.
 * Requires the actor to be authenticated (userId must be present) or be an admin.
 */
export async function createApiToken(
  input: { label: string; scopeSet: string[] },
  actor: PermissionContext,
): Promise<CreatedApiToken> {
  // Must be a real user or admin service account
  if (!actor.userId && !actor.isAdmin) {
    throw new ForbiddenError("create API token");
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  const db = getDb();

  const [row] = await db
    .insert(apiTokens)
    .values({
      label: input.label,
      tokenHash,
      scopeSet: input.scopeSet,
      status: "active",
      createdByUserId: actor.userId,
    })
    .returning();

  return {
    token: rawToken,
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
  };
}

/**
 * List tokens created by the actor. Returns metadata only — no plaintext tokens.
 */
export async function listApiTokens(actor: PermissionContext): Promise<ApiTokenSummary[]> {
  if (!actor.userId && !actor.isAdmin) {
    throw new ForbiddenError("list API tokens");
  }

  const db = getDb();

  // Admins without a userId see all tokens; otherwise filter by creator.
  const rows = actor.userId
    ? await db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.createdByUserId, actor.userId))
    : await db.select().from(apiTokens);

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    scopeSet: r.scopeSet,
    status: r.status,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt ?? null,
  }));
}

/**
 * Revoke a token. The actor must have created the token, or be an admin.
 */
export async function revokeApiToken(tokenId: string, actor: PermissionContext): Promise<void> {
  if (!actor.userId && !actor.isAdmin) {
    throw new ForbiddenError("revoke API token");
  }

  const db = getDb();

  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, tokenId))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError("ApiToken", tokenId);

  const token = rows[0];

  // Non-admin actors can only revoke their own tokens.
  if (!actor.isAdmin && token.createdByUserId !== actor.userId) {
    throw new ForbiddenError("revoke API token");
  }

  await db
    .update(apiTokens)
    .set({ status: "revoked" })
    .where(eq(apiTokens.id, tokenId));
}

/**
 * Validate a raw API token string. Returns token metadata or null if invalid/revoked.
 * Used by the authentication middleware — no actor required.
 */
export async function validateApiToken(rawToken: string): Promise<ValidatedApiToken | null> {
  const tokenHash = hashToken(rawToken);

  const db = getDb();

  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) return null;

  const token = rows[0];
  if (token.status !== "active") return null;

  // Update last_used_at asynchronously — fire-and-forget, non-blocking
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, token.id))
    .catch(() => {
      // Non-fatal: best effort
    });

  return {
    id: token.id,
    scopeSet: token.scopeSet,
    createdByUserId: token.createdByUserId ?? null,
  };
}
