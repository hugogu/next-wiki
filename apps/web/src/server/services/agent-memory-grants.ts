import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import type { AgentMemoryAccess } from '@/server/permissions/agent-memory';

function requireOwner(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only the Wiki owner can manage Agent Memory connections and grants');
  }
  return ctx.actor.userId;
}

async function assertConnectionOwner(userId: string, connectionId: string) {
  const connection = await db.query.agentMemoryConnections.findFirst({
    where: and(eq(schema.agentMemoryConnections.id, connectionId), eq(schema.agentMemoryConnections.ownerUserId, userId)),
    with: { namespace: true },
  });
  if (!connection) throw new DomainError('NOT_FOUND', 'Agent Memory connection not found');
  return connection;
}

async function assertDestinationOwner(userId: string, destinationId: string) {
  const destination = await db.query.agentMemoryNamespaces.findFirst({
    where: and(eq(schema.agentMemoryNamespaces.id, destinationId), eq(schema.agentMemoryNamespaces.ownerUserId, userId)),
  });
  if (!destination) throw new DomainError('NOT_FOUND', 'Agent Memory destination not found');
  if (destination.state !== 'active') throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'Agent Memory destination is unavailable');
  return destination;
}

export async function createDestination(ctx: PermCtx, input: { displayName: string; role: 'private' | 'shared' }) {
  const userId = requireOwner(ctx);
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 160) throw new DomainError('BAD_REQUEST', 'Destination name is invalid');
  const [destination] = await db.insert(schema.agentMemoryNamespaces).values({
    ownerUserId: userId,
    displayName,
    role: input.role,
  }).returning();
  if (!destination) throw new Error('AGENT_MEMORY_DESTINATION_INSERT_FAILED');
  return {
    destinationId: destination.id,
    displayName: destination.displayName,
    role: destination.role,
    state: destination.state,
  };
}

export async function setDestinationState(ctx: PermCtx, destinationId: string, state: 'active' | 'disabled'): Promise<void> {
  const userId = requireOwner(ctx);
  const destination = await assertDestinationOwner(userId, destinationId);
  await db.update(schema.agentMemoryNamespaces)
    .set({ state, disabledAt: state === 'active' ? null : new Date(), updatedAt: new Date() })
    .where(eq(schema.agentMemoryNamespaces.id, destination.id));
}

export async function createGrant(
  ctx: PermCtx,
  input: { connectionId: string; destinationId: string; capability: 'read' | 'write'; expiresAt?: string | null },
) {
  const userId = requireOwner(ctx);
  const connection = await assertConnectionOwner(userId, input.connectionId);
  const destination = await assertDestinationOwner(userId, input.destinationId);
  if (connection.namespaceId === destination.id) {
    throw new DomainError('BAD_REQUEST', 'A private destination does not need a grant to its own connection');
  }
  if (input.capability === 'write' && destination.role !== 'shared') {
    throw new DomainError('FORBIDDEN', 'Write grants are allowed only for shared destinations');
  }
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new DomainError('BAD_REQUEST', 'Grant expiry must be an ISO date');
  const [grant] = await db.insert(schema.agentMemoryDestinationGrants).values({
    granteeConnectionId: connection.id,
    destinationId: destination.id,
    capability: input.capability,
    grantedByUserId: userId,
    expiresAt,
  }).onConflictDoUpdate({
    target: [
      schema.agentMemoryDestinationGrants.granteeConnectionId,
      schema.agentMemoryDestinationGrants.destinationId,
      schema.agentMemoryDestinationGrants.capability,
    ],
    set: { state: 'active', revokedAt: null, expiresAt, createdAt: new Date() },
  }).returning();
  if (!grant) throw new Error('AGENT_MEMORY_GRANT_INSERT_FAILED');
  return {
    grantId: grant.id,
    connectionId: grant.granteeConnectionId,
    destinationId: grant.destinationId,
    capability: grant.capability,
    state: grant.state,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}

export async function listGrants(ctx: PermCtx, connectionId: string, capability?: 'read' | 'write') {
  const userId = requireOwner(ctx);
  await assertConnectionOwner(userId, connectionId);
  const rows = await db.query.agentMemoryDestinationGrants.findMany({
    where: and(
      eq(schema.agentMemoryDestinationGrants.granteeConnectionId, connectionId),
      ...(capability ? [eq(schema.agentMemoryDestinationGrants.capability, capability)] : []),
    ),
    with: { destination: true },
  });
  return rows.map((grant) => ({
    grantId: grant.id,
    connectionId: grant.granteeConnectionId,
    destinationId: grant.destinationId,
    capability: grant.capability,
    state: grant.state,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  }));
}

export async function revokeGrant(ctx: PermCtx, grantId: string): Promise<void> {
  const userId = requireOwner(ctx);
  const grant = await db.query.agentMemoryDestinationGrants.findFirst({
    where: and(eq(schema.agentMemoryDestinationGrants.id, grantId), eq(schema.agentMemoryDestinationGrants.grantedByUserId, userId)),
  });
  if (!grant) throw new DomainError('NOT_FOUND', 'Agent Memory grant not found');
  await db.update(schema.agentMemoryDestinationGrants)
    .set({ state: 'revoked', revokedAt: new Date() })
    .where(eq(schema.agentMemoryDestinationGrants.id, grantId));
}

export async function readableDestinationIds(access: AgentMemoryAccess, options: { includeOwn?: boolean } = {}): Promise<string[]> {
  const own = options.includeOwn === false ? [] : [access.namespaceId];
  if (!access.connectionId) return own;
  const grants = await db.query.agentMemoryDestinationGrants.findMany({
    where: and(
      eq(schema.agentMemoryDestinationGrants.granteeConnectionId, access.connectionId),
      eq(schema.agentMemoryDestinationGrants.capability, 'read'),
      eq(schema.agentMemoryDestinationGrants.state, 'active'),
    ),
  });
  const now = new Date();
  const active = grants.filter((grant) => !grant.expiresAt || grant.expiresAt > now).map((grant) => grant.destinationId);
  if (!active.length) return own;
  const destinations = await db.query.agentMemoryNamespaces.findMany({
    where: and(inArray(schema.agentMemoryNamespaces.id, active), eq(schema.agentMemoryNamespaces.ownerUserId, access.userId), eq(schema.agentMemoryNamespaces.state, 'active')),
    columns: { id: true },
  });
  return [...new Set([...own, ...destinations.map((destination) => destination.id)])];
}

export async function writableDestinationIds(access: AgentMemoryAccess): Promise<string[]> {
  const own = [access.namespaceId];
  if (!access.connectionId) return own;
  const grants = await db.query.agentMemoryDestinationGrants.findMany({
    where: and(
      eq(schema.agentMemoryDestinationGrants.granteeConnectionId, access.connectionId),
      eq(schema.agentMemoryDestinationGrants.capability, 'write'),
      eq(schema.agentMemoryDestinationGrants.state, 'active'),
    ),
  });
  const now = new Date();
  const candidates = grants.filter((grant) => !grant.expiresAt || grant.expiresAt > now).map((grant) => grant.destinationId);
  if (!candidates.length) return own;
  const destinations = await db.query.agentMemoryNamespaces.findMany({
    where: and(
      inArray(schema.agentMemoryNamespaces.id, candidates),
      eq(schema.agentMemoryNamespaces.ownerUserId, access.userId),
      eq(schema.agentMemoryNamespaces.role, 'shared'),
      eq(schema.agentMemoryNamespaces.state, 'active'),
    ),
    columns: { id: true },
  });
  return [...new Set([...own, ...destinations.map((destination) => destination.id)])];
}
