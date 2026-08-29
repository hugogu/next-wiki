import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';

export type AgentMemoryScope = 'memory.read' | 'memory.write' | 'memory.delete';

export type AgentMemoryAccess = {
  keyId: string;
  keyName: string;
  userId: string;
  /** 040: stable connection identity, or null for a 039 legacy key binding. */
  connectionId: string | null;
  connectionState: 'active' | 'disabled' | 'revoked' | null;
  namespaceId: string;
  namespaceName: string;
  agentIdentity: string;
  namespaceState: 'active' | 'disabled';
};

/**
 * The client never supplies a namespace, connection, destination, or agent
 * identity. This resolver obtains the connection (or, for a 039 credential
 * that predates connections, the legacy namespace binding directly) from the
 * authenticated key on every operation. A connection's private namespace is
 * always the resolved destination for normal save/capture operations.
 */
export async function requireAgentMemoryAccess(ctx: PermCtx, requiredScope: AgentMemoryScope | 'any'): Promise<AgentMemoryAccess> {
  if (ctx.actor.kind !== 'api_key') {
    throw new DomainError('UNAUTHORIZED', 'A dedicated Agent memory API key is required');
  }
  const hasRequiredScope = requiredScope === 'any'
    ? ctx.actor.scopes.some((scope) => scope.startsWith('memory.'))
    : ctx.actor.scopes.includes(requiredScope);
  if (!hasRequiredScope || ctx.actor.role !== 'admin') {
    throw new DomainError('AGENT_MEMORY_SCOPE_REQUIRED', 'This key does not have the required Agent memory permission');
  }

  const binding = await db.query.agentMemoryKeyBindings.findFirst({
    where: eq(schema.agentMemoryKeyBindings.apiKeyId, ctx.actor.keyId),
    with: {
      key: { columns: { name: true, userId: true } },
      namespace: true,
      connection: true,
    },
  });
  if (!binding || !binding.key || binding.key.userId !== ctx.actor.userId || binding.namespace.ownerUserId !== ctx.actor.userId) {
    throw new DomainError('AGENT_MEMORY_KEY_UNBOUND', 'This key is not bound to an active Agent memory destination');
  }

  // A connection-bound credential (every 040 credential) is authorized through
  // the connection, not the legacy binding row: a disabled/revoked connection
  // denies access even if its namespace row is still marked active.
  if (binding.connection) {
    if (binding.connection.ownerUserId !== ctx.actor.userId) {
      throw new DomainError('AGENT_MEMORY_KEY_UNBOUND', 'This key is not bound to an active Agent memory destination');
    }
    if (binding.connection.state !== 'active') {
      throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'The bound Agent memory connection is unavailable');
    }
    if (binding.namespace.state !== 'active') {
      throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'The bound Agent memory destination is unavailable');
    }
    return {
      keyId: ctx.actor.keyId,
      keyName: binding.key.name,
      userId: ctx.actor.userId,
      connectionId: binding.connection.id,
      connectionState: binding.connection.state,
      namespaceId: binding.namespaceId,
      namespaceName: binding.namespace.displayName,
      agentIdentity: binding.connection.agentIdentity,
      namespaceState: binding.namespace.state,
    };
  }

  // 039 legacy binding: no connection row. Resolver compatibility keeps this
  // path authorizing against the namespace directly.
  if (binding.namespace.state !== 'active') {
    throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'The bound Agent memory destination is unavailable');
  }

  return {
    keyId: ctx.actor.keyId,
    keyName: binding.key.name,
    userId: ctx.actor.userId,
    connectionId: null,
    connectionState: null,
    namespaceId: binding.namespaceId,
    namespaceName: binding.namespace.displayName,
    agentIdentity: binding.agentIdentity,
    namespaceState: binding.namespace.state,
  };
}

/**
 * Active, unexpired read grants for a connection, re-evaluated fresh on every
 * call. Callers MUST call this again immediately before serializing a result
 * that depends on it (FR-009) rather than caching it across the request.
 */
export async function listActiveGrantedDestinationIds(connectionId: string): Promise<string[]> {
  const grants = await db.query.agentMemoryDestinationGrants.findMany({
    where: and(
      eq(schema.agentMemoryDestinationGrants.granteeConnectionId, connectionId),
      eq(schema.agentMemoryDestinationGrants.state, 'active'),
    ),
    with: { destination: true },
  });
  const now = new Date();
  return grants
    .filter((grant) => (!grant.expiresAt || grant.expiresAt > now) && grant.destination.state === 'active' && grant.destination.role === 'shared')
    .map((grant) => grant.destinationId);
}

export async function memoryRecordBelongsToDestination(namespaceId: string, recordId: string, agentIdentity?: string): Promise<boolean> {
  const record = await db.query.agentMemoryRecords.findFirst({
    where: and(
      eq(schema.agentMemoryRecords.id, recordId),
      eq(schema.agentMemoryRecords.namespaceId, namespaceId),
      ...(agentIdentity ? [eq(schema.agentMemoryRecords.agentIdentity, agentIdentity)] : []),
    ),
    columns: { id: true },
  });
  return Boolean(record);
}
