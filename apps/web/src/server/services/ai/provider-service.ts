import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiProviders } from "@/server/db/schema/ai";
import { ForbiddenError, NotFoundError, ValidationError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";
import { env } from "@/server/config/env";

export type ProviderRow = typeof aiProviders.$inferSelect;

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  if (!env.ENCRYPTION_KEY) throw new ValidationError("ENCRYPTION_KEY not set");
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encryptCredentials(data: Record<string, string>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(12-byte-IV + 16-byte-auth-tag + ciphertext)
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString("base64");
}

export function decryptCredentials(encryptedBlob: string): Record<string, string> {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBlob, "base64");
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listProviders(actor: PermissionContext): Promise<ProviderRow[]> {
  if (!actor.isAdmin) throw new ForbiddenError("list providers");
  const db = getDb();
  return db.select().from(aiProviders);
}

export async function getProvider(id: string, actor: PermissionContext): Promise<ProviderRow> {
  if (!actor.isAdmin) throw new ForbiddenError("get provider");
  const db = getDb();
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (rows.length === 0) throw new NotFoundError("AiProvider", id);
  return rows[0];
}

export async function createProvider(
  input: {
    key: string;
    label: string;
    providerType: string;
    endpoint?: string;
    credentials?: Record<string, string>;
    defaultModel?: string;
    embeddingModel?: string;
  },
  actor: PermissionContext,
): Promise<ProviderRow> {
  if (!actor.isAdmin) throw new ForbiddenError("create provider");
  const db = getDb();
  const encryptedCredentials = input.credentials
    ? encryptCredentials(input.credentials)
    : null;
  const [row] = await db
    .insert(aiProviders)
    .values({
      key: input.key,
      label: input.label,
      providerType: input.providerType,
      endpoint: input.endpoint ?? null,
      encryptedCredentials,
      defaultModel: input.defaultModel ?? null,
      embeddingModel: input.embeddingModel ?? null,
    })
    .returning();
  return row;
}

export async function updateProvider(
  id: string,
  input: {
    label?: string;
    endpoint?: string;
    credentials?: Record<string, string>;
    defaultModel?: string;
    embeddingModel?: string;
    capabilities?: string[];
  },
  actor: PermissionContext,
): Promise<ProviderRow> {
  if (!actor.isAdmin) throw new ForbiddenError("update provider");
  const db = getDb();
  const rows = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(eq(aiProviders.id, id))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError("AiProvider", id);

  const patch: Partial<typeof aiProviders.$inferInsert> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.endpoint !== undefined) patch.endpoint = input.endpoint;
  if (input.credentials !== undefined)
    patch.encryptedCredentials = encryptCredentials(input.credentials);
  if (input.defaultModel !== undefined) patch.defaultModel = input.defaultModel;
  if (input.embeddingModel !== undefined) patch.embeddingModel = input.embeddingModel;
  if (input.capabilities !== undefined) patch.capabilities = input.capabilities;

  const [updated] = await db
    .update(aiProviders)
    .set(patch)
    .where(eq(aiProviders.id, id))
    .returning();
  return updated;
}

export async function deleteProvider(id: string, actor: PermissionContext): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError("delete provider");
  const db = getDb();
  const rows = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(eq(aiProviders.id, id))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError("AiProvider", id);
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
}

export async function setProviderStatus(
  id: string,
  status: "enabled" | "disabled",
  actor: PermissionContext,
): Promise<ProviderRow> {
  if (!actor.isAdmin) throw new ForbiddenError("set provider status");
  const db = getDb();
  const rows = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(eq(aiProviders.id, id))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError("AiProvider", id);
  const [updated] = await db
    .update(aiProviders)
    .set({ status, updatedAt: new Date() })
    .where(eq(aiProviders.id, id))
    .returning();
  return updated;
}

export async function getActiveProvider(): Promise<ProviderRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.status, "enabled"))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkProviderHealth(
  id: string,
  actor: PermissionContext,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!actor.isAdmin) throw new ForbiddenError("check provider health");
  const db = getDb();

  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (rows.length === 0) throw new NotFoundError("AiProvider", id);
  const provider = rows[0];

  const credentials = provider.encryptedCredentials
    ? decryptCredentials(provider.encryptedCredentials)
    : {};

  const start = Date.now();
  let ok = false;
  let error: string | undefined;

  try {
    if (provider.providerType === "openai") {
      const apiKey = credentials["apiKey"] ?? "";
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      ok = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } else if (provider.providerType === "anthropic") {
      const apiKey = credentials["apiKey"] ?? "";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: provider.defaultModel ?? "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      ok = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } else if (provider.providerType === "ollama") {
      const endpoint = provider.endpoint ?? "http://localhost:11434";
      const res = await fetch(`${endpoint}/api/tags`);
      ok = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } else {
      error = `Unsupported provider type: ${provider.providerType}`;
    }
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;

  if (ok) {
    await db
      .update(aiProviders)
      .set({ status: "enabled", errorMessage: null, updatedAt: new Date() })
      .where(eq(aiProviders.id, id));
  } else {
    await db
      .update(aiProviders)
      .set({ status: "error", errorMessage: error ?? null, updatedAt: new Date() })
      .where(eq(aiProviders.id, id));
  }

  return { ok, latencyMs, ...(error ? { error } : {}) };
}
