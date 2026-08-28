import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { encryptKey } from '@/server/crypto/key-encryption';
import type { ApiKeyScope } from '@next-wiki/shared';

function requireOwner(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only the Wiki owner can manage Agent Memory connections');
  }
  return ctx.actor.userId;
}

const KEY_PREFIX = 'nwk_';
const KEY_RANDOM_BYTES = 32;
const KEY_PREFIX_LENGTH = 12;
const MAX_KEYS_PER_USER = 10;

function generateKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_RANDOM_BYTES).toString('base64url')}`;
}

async function findOwnedConnection(userId: string, connectionId: string) {
  const connection = await db.query.agentMemoryConnections.findFirst({
    where: and(eq(schema.agentMemoryConnections.id, connectionId), eq(schema.agentMemoryConnections.ownerUserId, userId)),
  });
  if (!connection) throw new DomainError('NOT_FOUND', 'Agent Memory connection not found');
  return connection;
}

export type AgentMemoryConnectionView = {
  connectionId: string;
  agentIdentity: string;
  displayLabel: string;
  state: 'active' | 'disabled' | 'revoked';
  privateDestinationId: string;
};

export async function listConnections(ctx: PermCtx): Promise<AgentMemoryConnectionView[]> {
  const userId = requireOwner(ctx);
  const rows = await db.query.agentMemoryConnections.findMany({
    where: eq(schema.agentMemoryConnections.ownerUserId, userId),
    orderBy: (connections, { desc }) => [desc(connections.createdAt)],
  });
  return rows.map((row) => ({
    connectionId: row.id,
    agentIdentity: row.agentIdentity,
    displayLabel: row.displayLabel,
    state: row.state,
    privateDestinationId: row.namespaceId,
  }));
}

export async function getConnection(ctx: PermCtx, connectionId: string): Promise<AgentMemoryConnectionView> {
  const userId = requireOwner(ctx);
  const connection = await findOwnedConnection(userId, connectionId);
  return {
    connectionId: connection.id,
    agentIdentity: connection.agentIdentity,
    displayLabel: connection.displayLabel,
    state: connection.state,
    privateDestinationId: connection.namespaceId,
  };
}

export async function createConnection(
  ctx: PermCtx,
  input: { agentIdentity: string; displayLabel?: string },
): Promise<AgentMemoryConnectionView> {
  const userId = requireOwner(ctx);
  const identity = input.agentIdentity.trim();
  if (!identity || identity.length > 100 || /[\u0000-\u001f\u007f]/u.test(identity)) {
    throw new DomainError('BAD_REQUEST', 'Agent identity must be a non-empty printable value no longer than 100 characters');
  }
  const displayLabel = input.displayLabel?.trim() || identity;
  const result = await db.transaction(async (tx) => {
    const [namespace] = await tx.insert(schema.agentMemoryNamespaces).values({
      ownerUserId: userId,
      displayName: displayLabel,
      role: 'private',
    }).returning();
    if (!namespace) throw new Error('AGENT_MEMORY_NAMESPACE_INSERT_FAILED');
    const [connection] = await tx.insert(schema.agentMemoryConnections).values({
      ownerUserId: userId,
      namespaceId: namespace.id,
      agentIdentity: identity,
      displayLabel,
    }).returning();
    if (!connection) throw new Error('AGENT_MEMORY_CONNECTION_INSERT_FAILED');
    return { namespace, connection };
  });
  return {
    connectionId: result.connection.id,
    agentIdentity: result.connection.agentIdentity,
    displayLabel: result.connection.displayLabel,
    state: result.connection.state,
    privateDestinationId: result.namespace.id,
  };
}

export async function setConnectionState(
  ctx: PermCtx,
  connectionId: string,
  state: 'active' | 'disabled' | 'revoked',
): Promise<void> {
  const userId = requireOwner(ctx);
  const existing = await findOwnedConnection(userId, connectionId);
  if (existing.state === 'revoked' && state === 'active') {
    throw new DomainError('CONFLICT', 'A revoked Agent Memory connection cannot be re-enabled; create a new connection');
  }
  await db.update(schema.agentMemoryConnections)
    .set({ state, disabledAt: state === 'active' ? null : new Date(), updatedAt: new Date() })
    .where(and(eq(schema.agentMemoryConnections.id, connectionId), eq(schema.agentMemoryConnections.ownerUserId, userId)));
}

/** Issue a one-time bearer credential for an existing stable connection. */
export async function issueCredential(
  ctx: PermCtx,
  connectionId: string,
  input: { name: string; scopes: ApiKeyScope[] },
): Promise<{ id: string; name: string; keyPrefix: string; keySecret: string; scopes: ApiKeyScope[]; connectionId: string }> {
  const userId = requireOwner(ctx);
  const connection = await findOwnedConnection(userId, connectionId);
  if (connection.state !== 'active') throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'The Agent Memory connection is unavailable');
  if (!input.scopes.length || input.scopes.some((scope) => !scope.startsWith('memory.'))) {
    throw new DomainError('BAD_REQUEST', 'Agent Memory credentials may contain only memory scopes');
  }
  const activeCount = await db.$count(schema.apiKeys, and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)));
  if (activeCount >= MAX_KEYS_PER_USER) throw new DomainError('CONFLICT', 'You can have at most 10 active API keys');
  const keySecret = generateKey();
  const keyPrefix = keySecret.slice(0, KEY_PREFIX_LENGTH);
  const [row] = await db.transaction(async (tx) => {
    const [key] = await tx.insert(schema.apiKeys).values({
      userId,
      name: input.name.trim(),
      scopes: input.scopes,
      spaceAccess: ['wiki'],
      keyPrefix,
      keySecretEncrypted: encryptKey(keySecret),
    }).returning();
    if (!key) throw new Error('API_KEY_INSERT_FAILED');
    await tx.insert(schema.agentMemoryKeyBindings).values({
      apiKeyId: key.id,
      connectionId: connection.id,
      namespaceId: connection.namespaceId,
      agentIdentity: connection.agentIdentity,
      sharedByOwner: false,
    });
    return [key] as const;
  });
  return { id: row.id, name: row.name, keyPrefix: row.keyPrefix, keySecret, scopes: row.scopes, connectionId };
}

export async function listCredentials(ctx: PermCtx, connectionId: string) {
  const userId = requireOwner(ctx);
  await findOwnedConnection(userId, connectionId);
  const rows = await db.query.agentMemoryKeyBindings.findMany({
    where: eq(schema.agentMemoryKeyBindings.connectionId, connectionId),
    with: { key: true },
  });
  return rows.map((row) => ({
    id: row.key.id,
    name: row.key.name,
    keyPrefix: row.key.keyPrefix,
    scopes: row.key.scopes,
    revokedAt: row.key.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.key.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeCredential(ctx: PermCtx, connectionId: string, keyId: string): Promise<void> {
  const userId = requireOwner(ctx);
  await findOwnedConnection(userId, connectionId);
  const binding = await db.query.agentMemoryKeyBindings.findFirst({
    where: and(eq(schema.agentMemoryKeyBindings.apiKeyId, keyId), eq(schema.agentMemoryKeyBindings.connectionId, connectionId)),
    with: { key: true },
  });
  if (!binding || binding.key.userId !== userId) throw new DomainError('NOT_FOUND', 'Agent Memory credential not found');
  await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.id, keyId));
}
