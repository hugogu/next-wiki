import { randomBytes } from 'node:crypto';
import { eq, and, isNull, sql, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { encryptKey, decryptKey, constantTimeCompare } from '@/server/crypto/key-encryption';
import type { PermCtx } from '@/server/permissions';
import type { ApiKeyScope, ApiKeyView, ApiKeyCreated, ApiKeyReveal, CreateApiKeyInput, SpaceKind } from '@next-wiki/shared';

const ADMIN_ONLY_SPACE_KINDS: readonly SpaceKind[] = ['raw', 'generated'];

const KEY_PREFIX = 'nwk_';
const KEY_RANDOM_BYTES = 32;
const KEY_PREFIX_LENGTH = 12;
const MAX_KEYS_PER_USER = 10;
const PREFIX_COLLISION_RETRIES = 3;

type MemoryProviderKeyOptions = NonNullable<CreateApiKeyInput['memoryProvider']>;
type MemoryDestination = NonNullable<ApiKeyView['memoryDestination']>;

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
  requestedSpaceAccess?: SpaceKind[],
  memoryProvider?: MemoryProviderKeyOptions,
): Promise<ApiKeyCreated> {
  const userId = requireUserId(ctx);
  const memoryScopes = scopes.filter((scope) => scope.startsWith('memory.'));
  const memoryAgentIdentity = typeof memoryProvider?.agentIdentity === 'string'
    ? memoryProvider.agentIdentity.trim()
    : undefined;
  if (memoryProvider && (!memoryAgentIdentity || memoryAgentIdentity.length > 100 || !/^[^\u0000-\u001f\u007f]+$/u.test(memoryAgentIdentity))) {
    throw new DomainError('BAD_REQUEST', 'Agent identity must be a non-empty value no longer than 100 characters');
  }
  if (memoryScopes.length > 0 && !memoryProvider) {
    throw new DomainError('BAD_REQUEST', 'Agent memory scopes require a bound Agent memory destination');
  }
  if (memoryProvider && (memoryScopes.length === 0 || memoryScopes.length !== scopes.length)) {
    throw new DomainError('BAD_REQUEST', 'An Agent memory key may contain only dedicated memory scopes');
  }
  if (memoryProvider && (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin')) {
    throw new DomainError('FORBIDDEN', 'Only administrators may create an Agent memory API key');
  }

  // 'wiki' is always implicitly allowed (see spaceAllowedForKey), but the
  // stored/returned list should reflect that canonically rather than only
  // when the caller happened to include it explicitly.
  const spaceAccess: SpaceKind[] = Array.from(new Set(['wiki', ...(requestedSpaceAccess ?? [])]));
  const grantsAdminOnlySpace = spaceAccess.some((kind) => ADMIN_ONLY_SPACE_KINDS.includes(kind));
  if (grantsAdminOnlySpace && !(ctx.actor.kind === 'user' && ctx.actor.role === 'admin')) {
    throw new DomainError('FORBIDDEN', 'Only admins may grant raw/generated space access to an API key');
  }
  if (memoryProvider && spaceAccess.some((kind) => kind !== 'wiki')) {
    throw new DomainError('BAD_REQUEST', 'Agent memory API keys cannot access Raw or Generated spaces');
  }

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

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.apiKeys)
      .values({
        userId,
        name: name.trim(),
        scopes,
        spaceAccess,
        keyPrefix: prefix,
        keySecretEncrypted: encrypted,
      })
      .returning();

    if (!row) throw new Error('API_KEY_INSERT_FAILED');

    let destination: MemoryDestination | null = null;
    if (memoryProvider) {
      const namespace = memoryProvider.sharedNamespaceId
        ? await tx.query.agentMemoryNamespaces.findFirst({
            where: and(
              eq(schema.agentMemoryNamespaces.id, memoryProvider.sharedNamespaceId),
              eq(schema.agentMemoryNamespaces.ownerUserId, userId),
              eq(schema.agentMemoryNamespaces.state, 'active'),
            ),
          })
        : (await tx
            .insert(schema.agentMemoryNamespaces)
            .values({ ownerUserId: userId, displayName: memoryProvider.displayName?.trim() || 'Agent memory' })
            .returning())[0];
      if (!namespace) {
        throw new DomainError('NOT_FOUND', 'The selected Agent memory destination is unavailable');
      }
      if (memoryProvider.sharedNamespaceId && namespace.role !== 'shared') {
        await tx.update(schema.agentMemoryNamespaces)
          .set({ role: 'shared', updatedAt: new Date() })
          .where(eq(schema.agentMemoryNamespaces.id, namespace.id));
      }
      const connection = !memoryProvider.sharedNamespaceId
        ? (await tx.insert(schema.agentMemoryConnections).values({
            ownerUserId: userId,
            namespaceId: namespace.id,
            agentIdentity: memoryAgentIdentity!,
            displayLabel: memoryProvider.displayName?.trim() || memoryAgentIdentity!,
          }).returning())[0]
        : null;
      await tx.insert(schema.agentMemoryKeyBindings).values({
        apiKeyId: row.id,
        connectionId: connection?.id ?? null,
        namespaceId: namespace.id,
        agentIdentity: memoryAgentIdentity!,
        sharedByOwner: Boolean(memoryProvider.sharedNamespaceId),
      });
      destination = { id: namespace.id, connectionId: connection?.id ?? null, displayName: namespace.displayName, state: namespace.state, agentIdentity: memoryAgentIdentity! };
    }

    return { row, destination };
  });

  const { row, destination } = created;

  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    spaceAccess: row.spaceAccess,
    keyPrefix: row.keyPrefix,
    keySecret: key,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    memoryDestination: destination,
  };
}

export async function list(ctx: PermCtx): Promise<ApiKeyView[]> {
  const userId = requireUserId(ctx);

  const rows = await db.query.apiKeys.findMany({
    where: eq(schema.apiKeys.userId, userId),
    orderBy: sql`${schema.apiKeys.createdAt} desc`,
  });

  const bindings = rows.length > 0
    ? await db.query.agentMemoryKeyBindings.findMany({
        where: inArray(schema.agentMemoryKeyBindings.apiKeyId, rows.map((row) => row.id)),
        with: { namespace: true },
      })
    : [];
  const destinations = new Map(bindings.map((binding) => [binding.apiKeyId, {
    id: binding.namespace.id,
    connectionId: binding.connectionId ?? null,
    displayName: binding.namespace.displayName,
    state: binding.namespace.state,
    agentIdentity: binding.agentIdentity,
  }]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    spaceAccess: row.spaceAccess,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    memoryDestination: destinations.get(row.id) ?? null,
  }));
}

export async function listMemoryDestinations(ctx: PermCtx): Promise<MemoryDestination[]> {
  const userId = requireUserId(ctx);
  const rows = await db.query.agentMemoryNamespaces.findMany({
    where: eq(schema.agentMemoryNamespaces.ownerUserId, userId),
    orderBy: sql`${schema.agentMemoryNamespaces.createdAt} desc`,
    with: { connections: true },
  });
  return rows.map((row) => ({
    id: row.id,
    connectionId: row.connections[0]?.id ?? null,
    displayName: row.displayName,
    state: row.state,
    agentIdentity: row.connections[0]?.agentIdentity ?? 'unassigned',
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
  spaceAccess: SpaceKind[];
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
    spaceAccess: row.spaceAccess,
  };
}
