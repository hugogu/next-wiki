import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';

export type AgentMemoryScope = 'memory.read' | 'memory.write' | 'memory.delete';

export type AgentMemoryAccess = {
  keyId: string;
  userId: string;
  namespaceId: string;
  namespaceName: string;
  agentIdentity: string;
  namespaceState: 'active' | 'disabled';
};

/**
 * The client never supplies a namespace or profile. This resolver obtains the
 * single destination from the authenticated key on every operation.
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
    with: { namespace: true },
  });
  if (!binding || binding.namespace.ownerUserId !== ctx.actor.userId) {
    throw new DomainError('AGENT_MEMORY_KEY_UNBOUND', 'This key is not bound to an active Agent memory destination');
  }
  if (binding.namespace.state !== 'active') {
    throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'The bound Agent memory destination is unavailable');
  }

  return {
    keyId: ctx.actor.keyId,
    userId: ctx.actor.userId,
    namespaceId: binding.namespaceId,
    namespaceName: binding.namespace.displayName,
    agentIdentity: binding.agentIdentity,
    namespaceState: binding.namespace.state,
  };
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
