import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';

export type HermesMemoryScope = 'memory.read' | 'memory.write' | 'memory.delete';

export type HermesMemoryAccess = {
  keyId: string;
  userId: string;
  namespaceId: string;
  namespaceName: string;
  namespaceState: 'active' | 'disabled';
};

/**
 * The client never supplies a namespace or profile. This resolver obtains the
 * single destination from the authenticated key on every operation.
 */
export async function requireHermesMemoryAccess(ctx: PermCtx, requiredScope: HermesMemoryScope | 'any'): Promise<HermesMemoryAccess> {
  if (ctx.actor.kind !== 'api_key') {
    throw new DomainError('UNAUTHORIZED', 'A dedicated Hermes memory API key is required');
  }
  const hasRequiredScope = requiredScope === 'any'
    ? ctx.actor.scopes.some((scope) => scope.startsWith('memory.'))
    : ctx.actor.scopes.includes(requiredScope);
  if (!hasRequiredScope || ctx.actor.role !== 'admin') {
    throw new DomainError('HERMES_MEMORY_SCOPE_REQUIRED', 'This key does not have the required Hermes memory permission');
  }

  const binding = await db.query.hermesMemoryKeyBindings.findFirst({
    where: eq(schema.hermesMemoryKeyBindings.apiKeyId, ctx.actor.keyId),
    with: { namespace: true },
  });
  if (!binding || binding.namespace.ownerUserId !== ctx.actor.userId) {
    throw new DomainError('HERMES_MEMORY_KEY_UNBOUND', 'This key is not bound to an active Hermes memory destination');
  }
  if (binding.namespace.state !== 'active') {
    throw new DomainError('HERMES_MEMORY_NAMESPACE_UNAVAILABLE', 'The bound Hermes memory destination is unavailable');
  }

  return {
    keyId: ctx.actor.keyId,
    userId: ctx.actor.userId,
    namespaceId: binding.namespaceId,
    namespaceName: binding.namespace.displayName,
    namespaceState: binding.namespace.state,
  };
}

export async function memoryRecordBelongsToDestination(namespaceId: string, recordId: string): Promise<boolean> {
  const record = await db.query.hermesMemoryRecords.findFirst({
    where: and(eq(schema.hermesMemoryRecords.id, recordId), eq(schema.hermesMemoryRecords.namespaceId, namespaceId)),
    columns: { id: true },
  });
  return Boolean(record);
}
