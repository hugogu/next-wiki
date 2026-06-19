import { randomBytes } from 'node:crypto';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { encryptKey, decryptKey, constantTimeCompare } from '@/server/crypto/key-encryption';
import type { PermCtx } from '@/server/permissions';
import type { ApiKeyScope, ApiKeyView, ApiKeyCreated, ApiKeyReveal } from '@next-wiki/shared';

const KEY_PREFIX = 'nwk_';
const KEY_RANDOM_BYTES = 32;
const KEY_PREFIX_LENGTH = 12;
const MAX_KEYS_PER_USER = 10;
const PREFIX_COLLISION_RETRIES = 3;

function generateKey(): string {
  const bytes = randomBytes(KEY_RANDOM_BYTES);
  const token = bytes.toString('base64url');
  return `${KEY_PREFIX}${token}`;
}

function extractPrefix(token: string): string {
  return token.slice(0, KEY_PREFIX_LENGTH);
}

/**
 * Account-management operations (list/create/reveal/revoke) are session-only.
 * An API-key actor must never read, mint, reveal, or revoke keys — that would
 * let a key escalate (mint a broader sibling) or exfiltrate other keys.
 */
function requireUserId(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to manage your API keys');
  }
  return ctx.actor.userId;
}

export async function create(
  ctx: PermCtx,
  name: string,
  scopes: ApiKeyScope[],
): Promise<ApiKeyCreated> {
  const userId = requireUserId(ctx);

  const activeCount = await db.$count(
    schema.apiKeys,
    and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)),
  );
  if (activeCount >= MAX_KEYS_PER_USER) {
    throw new DomainError('CONFLICT', `You can have at most ${MAX_KEYS_PER_USER} active API keys`);
  }

  // The pre-insert lookup just avoids the common case; the real guarantee is the
  // UNIQUE constraint on api_keys.key_prefix, so a concurrent duplicate can never
  // land (it fails the insert instead). 48 bits of prefix entropy makes a
  // collision astronomically unlikely in the first place.
  let key: string | null = null;
  let prefix: string | null = null;
  let encrypted: string | null = null;
  let attempts = 0;

  while (attempts < PREFIX_COLLISION_RETRIES) {
    const candidate = generateKey();
    const candidatePrefix = extractPrefix(candidate);
    const candidateEncrypted = encryptKey(candidate);

    const existing = await db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.keyPrefix, candidatePrefix),
    });

    if (!existing) {
      key = candidate;
      prefix = candidatePrefix;
      encrypted = candidateEncrypted;
      break;
    }
    attempts++;
  }

  if (!key || !prefix || !encrypted) {
    throw new DomainError('CONFLICT', 'Could not generate a unique API key prefix. Please try again.');
  }

  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      userId,
      name: name.trim(),
      scopes,
      keyPrefix: prefix,
      keySecretEncrypted: encrypted,
    })
    .returning();

  if (!row) {
    throw new Error('API_KEY_INSERT_FAILED');
  }

  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    keyPrefix: row.keyPrefix,
    keySecret: key,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function list(ctx: PermCtx): Promise<ApiKeyView[]> {
  const userId = requireUserId(ctx);

  const rows = await db.query.apiKeys.findMany({
    where: eq(schema.apiKeys.userId, userId),
    orderBy: sql`${schema.apiKeys.createdAt} desc`,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  }));
}

export async function reveal(ctx: PermCtx, keyId: string): Promise<ApiKeyReveal> {
  const userId = requireUserId(ctx);

  const row = await db.query.apiKeys.findFirst({
    where: and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)),
  });

  if (!row) {
    throw new DomainError('NOT_FOUND', 'API key not found');
  }

  return {
    id: row.id,
    keySecret: decryptKey(row.keySecretEncrypted),
  };
}

export async function revoke(ctx: PermCtx, keyId: string): Promise<void> {
  const userId = requireUserId(ctx);

  const [updated] = await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'API key not found');
  }
}

type ResolvedKey = {
  keyId: string;
  userId: string;
  role: 'admin' | 'editor' | 'reader';
  scopes: ApiKeyScope[];
};

export async function lookupByToken(token: string): Promise<ResolvedKey | null> {
  if (!token.startsWith(KEY_PREFIX) || token.length < KEY_PREFIX_LENGTH + 1) {
    return null;
  }

  const prefix = extractPrefix(token);
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(schema.apiKeys.keyPrefix, prefix), isNull(schema.apiKeys.revokedAt)),
    with: { user: true },
  });

  if (!row) return null;
  if (row.user.status === 'disabled') return null;

  const decrypted = decryptKey(row.keySecretEncrypted);
  if (!constantTimeCompare(decrypted, token)) {
    return null;
  }

  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id));

  return {
    keyId: row.id,
    userId: row.userId,
    role: row.user.role,
    scopes: row.scopes,
  };
}
