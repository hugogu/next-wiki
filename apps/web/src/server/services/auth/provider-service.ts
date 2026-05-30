import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { authProviders } from "@/server/db/schema/auth";
import { runtime } from "@/server/config/runtime";
import { ForbiddenError, NotFoundError, ConflictError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthProviderInput = {
  providerType: "oidc" | "ldap" | "saml";
  key: string;
  label: string;
  config: Record<string, unknown>;
};

export type AuthProvider = {
  id: string;
  providerType: string;
  key: string;
  label: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthProviderWithDecryptedConfig = AuthProvider & {
  decryptedConfig: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

// Field names that are considered sensitive credentials.
const SENSITIVE_KEY_PATTERNS = ["secret", "password", "key", "token"];

function isSensitiveField(fieldKey: string): boolean {
  const lower = fieldKey.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

function getEncryptionKey(): Buffer {
  return Buffer.from(runtime.encryption.key, "hex");
}

function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv(12) + authTag(16) + ciphertext
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString("base64");
}

function decryptValue(encoded: string): string {
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * Encrypt sensitive fields in a config object before storing.
 * Returns a new object with sensitive string values replaced by encrypted base64.
 */
function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (isSensitiveField(k) && typeof v === "string" && v.length > 0) {
      result[k] = `enc:${encryptValue(v)}`;
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Decrypt sensitive fields in a stored config object.
 * Returns a new object with `enc:` prefixed values decrypted.
 */
function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string" && v.startsWith("enc:")) {
      result[k] = decryptValue(v.slice(4));
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Row → public type mapper (strips config from public view)
// ---------------------------------------------------------------------------

function toAuthProvider(row: typeof authProviders.$inferSelect): AuthProvider {
  return {
    id: row.id,
    providerType: row.providerType,
    key: row.key,
    label: row.label,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * List all auth providers. Admin only.
 */
export async function listAuthProviders(actor: PermissionContext): Promise<AuthProvider[]> {
  if (!actor.isAdmin) throw new ForbiddenError("list auth providers");

  const db = getDb();
  const rows = await db.select().from(authProviders);
  return rows.map(toAuthProvider);
}

/**
 * Create a new auth provider. Admin only.
 */
export async function createAuthProvider(
  input: AuthProviderInput,
  actor: PermissionContext,
): Promise<AuthProvider> {
  if (!actor.isAdmin) throw new ForbiddenError("create auth provider");

  const db = getDb();

  const existing = await db
    .select({ id: authProviders.id })
    .from(authProviders)
    .where(eq(authProviders.key, input.key))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Auth provider with key '${input.key}' already exists`);
  }

  const encryptedConfig = encryptConfig(input.config);

  const [row] = await db
    .insert(authProviders)
    .values({
      providerType: input.providerType,
      key: input.key,
      label: input.label,
      status: "disabled",
      config: encryptedConfig,
    })
    .returning();

  return toAuthProvider(row);
}

/**
 * Update a provider's config and/or label. Admin only.
 */
export async function updateAuthProvider(
  key: string,
  input: Partial<AuthProviderInput>,
  actor: PermissionContext,
): Promise<AuthProvider> {
  if (!actor.isAdmin) throw new ForbiddenError("update auth provider");

  const db = getDb();

  const rows = await db
    .select()
    .from(authProviders)
    .where(eq(authProviders.key, key))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError("AuthProvider", key);

  const updates: Partial<typeof authProviders.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.label !== undefined) updates.label = input.label;
  if (input.providerType !== undefined) updates.providerType = input.providerType;
  if (input.config !== undefined) updates.config = encryptConfig(input.config);

  const [updated] = await db
    .update(authProviders)
    .set(updates)
    .where(eq(authProviders.key, key))
    .returning();

  return toAuthProvider(updated);
}

/**
 * Enable or disable an auth provider. Admin only.
 */
export async function setAuthProviderStatus(
  key: string,
  status: "enabled" | "disabled",
  actor: PermissionContext,
): Promise<AuthProvider> {
  if (!actor.isAdmin) throw new ForbiddenError("update auth provider status");

  const db = getDb();

  const rows = await db
    .select({ id: authProviders.id })
    .from(authProviders)
    .where(eq(authProviders.key, key))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError("AuthProvider", key);

  const [updated] = await db
    .update(authProviders)
    .set({ status, updatedAt: new Date() })
    .where(eq(authProviders.key, key))
    .returning();

  return toAuthProvider(updated);
}

/**
 * Delete an auth provider. Admin only.
 */
export async function deleteAuthProvider(key: string, actor: PermissionContext): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError("delete auth provider");

  const db = getDb();

  const rows = await db
    .select({ id: authProviders.id })
    .from(authProviders)
    .where(eq(authProviders.key, key))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError("AuthProvider", key);

  await db.delete(authProviders).where(eq(authProviders.key, key));
}

/**
 * Get a single provider with its config decrypted. Used by the auth login flow.
 * Does NOT require admin — called by internal auth machinery.
 */
export async function getAuthProvider(key: string): Promise<AuthProviderWithDecryptedConfig> {
  const db = getDb();

  const rows = await db
    .select()
    .from(authProviders)
    .where(eq(authProviders.key, key))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError("AuthProvider", key);

  const row = rows[0];
  const decryptedConfig = decryptConfig(row.config as Record<string, unknown>);

  return {
    ...toAuthProvider(row),
    decryptedConfig,
  };
}
