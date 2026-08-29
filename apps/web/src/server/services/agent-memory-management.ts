import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import type { AgentMemoryAccess } from '@/server/permissions/agent-memory';
import { createRecord, recordToView } from '@/server/services/agent-memory';
import { mintApiKeyMaterial } from '@/server/services/api-keys';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
import type {
  AgentMemoryConnectionSummary,
  AgentMemoryCreateConnectionInput,
  AgentMemoryCreateGrantInput,
  AgentMemoryCreateSharedDestinationInput,
  AgentMemoryDestinationGrant,
  AgentMemoryPromotionInput,
  AgentMemoryRecord,
  AgentMemorySharedDestination,
  ApiKeyScope,
} from '@next-wiki/shared';

const CONNECTION_MEMORY_SCOPES: ApiKeyScope[] = ['memory.read', 'memory.write', 'memory.delete'];

type ConnectionRow = typeof schema.agentMemoryConnections.$inferSelect;
type GrantRow = typeof schema.agentMemoryDestinationGrants.$inferSelect;

/**
 * Every route in this module is session-only owner/admin management, mirroring
 * the existing account-management convention in `api-keys.ts`: an Agent
 * memory credential (bearer key) must never create, change, or select a
 * connection, shared destination, or grant.
 */
function requireOwnerId(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only administrators may manage Agent memory connections');
  }
  return ctx.actor.userId;
}

function connectionView(row: ConnectionRow): AgentMemoryConnectionSummary {
  return {
    connectionId: row.id,
    displayName: row.displayName,
    agentIdentity: row.agentIdentity,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

function grantView(row: GrantRow): AgentMemoryDestinationGrant {
  return {
    grantId: row.id,
    granteeConnectionId: row.granteeConnectionId,
    destinationId: row.destinationId,
    capability: row.capability,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

async function requireOwnedConnection(userId: string, connectionId: string): Promise<ConnectionRow> {
  const connection = await db.query.agentMemoryConnections.findFirst({
    where: and(eq(schema.agentMemoryConnections.id, connectionId), eq(schema.agentMemoryConnections.ownerUserId, userId)),
  });
  if (!connection) throw new DomainError('NOT_FOUND', 'Agent memory connection not found');
  return connection;
}

export async function createConnection(
  ctx: PermCtx,
  input: AgentMemoryCreateConnectionInput,
): Promise<{ connection: AgentMemoryConnectionSummary; keyId: string; keySecret: string }> {
  const userId = requireOwnerId(ctx);
  const agentIdentity = input.agentIdentity?.trim() || randomUUID();
  const { key, prefix, encrypted } = await mintApiKeyMaterial();

  const created = await db.transaction(async (tx) => {
    const [namespace] = await tx.insert(schema.agentMemoryNamespaces).values({
      ownerUserId: userId,
      displayName: input.displayName.trim(),
      role: 'private',
    }).returning();
    if (!namespace) throw new Error('AGENT_MEMORY_NAMESPACE_INSERT_FAILED');

    const [connection] = await tx.insert(schema.agentMemoryConnections).values({
      ownerUserId: userId,
      privateNamespaceId: namespace.id,
      agentIdentity,
      displayName: input.displayName.trim(),
    }).returning();
    if (!connection) throw new Error('AGENT_MEMORY_CONNECTION_INSERT_FAILED');

    const [apiKey] = await tx.insert(schema.apiKeys).values({
      userId,
      name: `Agent memory: ${input.displayName.trim()}`,
      scopes: CONNECTION_MEMORY_SCOPES,
      spaceAccess: ['wiki'],
      keyPrefix: prefix,
      keySecretEncrypted: encrypted,
    }).returning();
    if (!apiKey) throw new Error('API_KEY_INSERT_FAILED');

    await tx.insert(schema.agentMemoryKeyBindings).values({
      apiKeyId: apiKey.id,
      namespaceId: namespace.id,
      connectionId: connection.id,
      agentIdentity,
    });

    return { connection, apiKey };
  });

  return { connection: connectionView(created.connection), keyId: created.apiKey.id, keySecret: key };
}

export async function listConnections(ctx: PermCtx): Promise<AgentMemoryConnectionSummary[]> {
  const userId = requireOwnerId(ctx);
  const rows = await db.query.agentMemoryConnections.findMany({
    where: eq(schema.agentMemoryConnections.ownerUserId, userId),
    orderBy: (connections, { desc }) => [desc(connections.createdAt)],
  });
  return rows.map(connectionView);
}

export async function disableConnection(ctx: PermCtx, connectionId: string): Promise<AgentMemoryConnectionSummary> {
  const userId = requireOwnerId(ctx);
  await requireOwnedConnection(userId, connectionId);
  const [updated] = await db.update(schema.agentMemoryConnections)
    .set({ state: 'disabled', disabledAt: new Date() })
    .where(eq(schema.agentMemoryConnections.id, connectionId))
    .returning();
  if (!updated) throw new Error('AGENT_MEMORY_CONNECTION_UPDATE_FAILED');
  return connectionView(updated);
}

export async function revokeConnection(ctx: PermCtx, connectionId: string): Promise<AgentMemoryConnectionSummary> {
  const userId = requireOwnerId(ctx);
  await requireOwnedConnection(userId, connectionId);
  const [updated] = await db.update(schema.agentMemoryConnections)
    .set({ state: 'revoked', revokedAt: new Date() })
    .where(eq(schema.agentMemoryConnections.id, connectionId))
    .returning();
  if (!updated) throw new Error('AGENT_MEMORY_CONNECTION_UPDATE_FAILED');
  return connectionView(updated);
}

/**
 * Issues an additional credential bound to the same connection. Rotation does
 * not revoke the prior credential: the owner revokes it separately once the
 * new one is confirmed working, matching data-model.md's "another binding for
 * the same connection" rotation model.
 */
export async function rotateCredential(ctx: PermCtx, connectionId: string): Promise<{ keyId: string; keySecret: string }> {
  const userId = requireOwnerId(ctx);
  const connection = await requireOwnedConnection(userId, connectionId);
  if (connection.state !== 'active') {
    throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'Only an active connection may rotate its credential');
  }
  const { key, prefix, encrypted } = await mintApiKeyMaterial();
  const apiKey = await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.apiKeys).values({
      userId,
      name: `Agent memory: ${connection.displayName} (rotated)`,
      scopes: CONNECTION_MEMORY_SCOPES,
      spaceAccess: ['wiki'],
      keyPrefix: prefix,
      keySecretEncrypted: encrypted,
    }).returning();
    if (!row) throw new Error('API_KEY_INSERT_FAILED');
    await tx.insert(schema.agentMemoryKeyBindings).values({
      apiKeyId: row.id,
      namespaceId: connection.privateNamespaceId,
      connectionId: connection.id,
      agentIdentity: connection.agentIdentity,
    });
    return row;
  });
  return { keyId: apiKey.id, keySecret: key };
}

function sharedDestinationView(row: { id: string; displayName: string; state: 'active' | 'disabled' }): AgentMemorySharedDestination {
  return { id: row.id, displayName: row.displayName, role: 'shared', state: row.state };
}

export async function createSharedDestination(
  ctx: PermCtx,
  input: AgentMemoryCreateSharedDestinationInput,
): Promise<AgentMemorySharedDestination> {
  const userId = requireOwnerId(ctx);
  const [namespace] = await db.insert(schema.agentMemoryNamespaces).values({
    ownerUserId: userId,
    displayName: input.displayName.trim(),
    role: 'shared',
  }).returning();
  if (!namespace) throw new Error('AGENT_MEMORY_NAMESPACE_INSERT_FAILED');
  return sharedDestinationView(namespace);
}

export async function listSharedDestinations(ctx: PermCtx): Promise<AgentMemorySharedDestination[]> {
  const userId = requireOwnerId(ctx);
  const rows = await db.query.agentMemoryNamespaces.findMany({
    where: and(
      eq(schema.agentMemoryNamespaces.ownerUserId, userId),
      eq(schema.agentMemoryNamespaces.role, 'shared'),
    ),
    orderBy: (namespaces, { desc }) => [desc(namespaces.createdAt)],
  });
  return rows.map(sharedDestinationView);
}

export async function listGrants(ctx: PermCtx): Promise<AgentMemoryDestinationGrant[]> {
  const userId = requireOwnerId(ctx);
  const rows = await db.query.agentMemoryDestinationGrants.findMany({
    where: eq(schema.agentMemoryDestinationGrants.grantedByUserId, userId),
    orderBy: (grants, { desc }) => [desc(grants.createdAt)],
  });
  return rows.map(grantView);
}

/**
 * Owner-only. `destinationId` is a URL path parameter (the shared destination
 * being granted read access to); the connection being granted access is the
 * request body. Neither value is ever accepted from an agent credential.
 */
export async function createGrant(
  ctx: PermCtx,
  destinationId: string,
  input: AgentMemoryCreateGrantInput,
): Promise<AgentMemoryDestinationGrant> {
  const userId = requireOwnerId(ctx);
  const [destination, grantee] = await Promise.all([
    db.query.agentMemoryNamespaces.findFirst({
      where: and(
        eq(schema.agentMemoryNamespaces.id, destinationId),
        eq(schema.agentMemoryNamespaces.ownerUserId, userId),
        eq(schema.agentMemoryNamespaces.role, 'shared'),
        eq(schema.agentMemoryNamespaces.state, 'active'),
      ),
    }),
    db.query.agentMemoryConnections.findFirst({
      where: and(
        eq(schema.agentMemoryConnections.id, input.granteeConnectionId),
        eq(schema.agentMemoryConnections.ownerUserId, userId),
        eq(schema.agentMemoryConnections.state, 'active'),
      ),
    }),
  ]);
  if (!destination) throw new DomainError('NOT_FOUND', 'Shared Agent memory destination not found');
  if (!grantee) throw new DomainError('NOT_FOUND', 'Agent memory connection not found');

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  const [grant] = await db.insert(schema.agentMemoryDestinationGrants).values({
    granteeConnectionId: grantee.id,
    destinationId: destination.id,
    grantedByUserId: userId,
    expiresAt,
  }).onConflictDoUpdate({
    target: [
      schema.agentMemoryDestinationGrants.granteeConnectionId,
      schema.agentMemoryDestinationGrants.destinationId,
      schema.agentMemoryDestinationGrants.capability,
    ],
    set: { state: 'active', revokedAt: null, expiresAt, grantedByUserId: userId },
  }).returning();
  if (!grant) throw new Error('AGENT_MEMORY_GRANT_INSERT_FAILED');
  return grantView(grant);
}

export async function revokeGrant(ctx: PermCtx, grantId: string): Promise<void> {
  const userId = requireOwnerId(ctx);
  const grant = await db.query.agentMemoryDestinationGrants.findFirst({
    where: eq(schema.agentMemoryDestinationGrants.id, grantId),
    with: { destination: true },
  });
  if (!grant || grant.destination.ownerUserId !== userId) {
    throw new DomainError('NOT_FOUND', 'Grant not found');
  }
  if (grant.state !== 'revoked') {
    await db.update(schema.agentMemoryDestinationGrants)
      .set({ state: 'revoked', revokedAt: new Date() })
      .where(eq(schema.agentMemoryDestinationGrants.id, grant.id));
  }
}

/**
 * Owner-only curation: copies an existing (private or already-shared) record
 * into a new, separately attributable shared record with an immutable
 * `promotion` evidence link back to the source. The source itself, and its
 * original destination's access, are never changed — this never expands who
 * can read the source (data-model.md).
 */
export async function promote(ctx: PermCtx, input: AgentMemoryPromotionInput): Promise<{ record: AgentMemoryRecord }> {
  const userId = requireOwnerId(ctx);
  const destination = await db.query.agentMemoryNamespaces.findFirst({
    where: and(
      eq(schema.agentMemoryNamespaces.id, input.destinationId),
      eq(schema.agentMemoryNamespaces.ownerUserId, userId),
      eq(schema.agentMemoryNamespaces.role, 'shared'),
      eq(schema.agentMemoryNamespaces.state, 'active'),
    ),
  });
  if (!destination) throw new DomainError('NOT_FOUND', 'Shared Agent memory destination not found');

  const source = await db.query.agentMemoryRecords.findFirst({
    where: eq(schema.agentMemoryRecords.id, input.sourceRecordId),
    with: { namespace: true },
  });
  if (!source || source.namespace.ownerUserId !== userId || source.state !== 'active') {
    throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'Source memory record not found');
  }
  const [sourceView, sourceRevision] = await Promise.all([
    recordToView(source),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, source.currentRevisionId) }),
  ]);
  if (!sourceView || !sourceRevision) {
    throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'Source memory record is unavailable');
  }
  const content = await readMarkdownWithFallback(sourceRevision);

  const promotionAccess: AgentMemoryAccess = {
    keyId: 'owner-promotion',
    keyName: 'Owner promotion',
    userId,
    connectionId: null,
    connectionState: null,
    namespaceId: destination.id,
    namespaceName: destination.displayName,
    agentIdentity: 'owner-curated',
    namespaceState: destination.state,
  };

  // createRecord's generic evidenceIds path requires the evidence to be an
  // `evidence`-typed record in the *same* destination/agent identity — an
  // invariant that intentionally does not hold for a cross-destination
  // `memory`-typed promotion source. The link is inserted directly below
  // instead, once, guarded by `idempotent` so a retried promotion cannot
  // create a duplicate link.
  const { record, idempotent } = await createRecord(ctx, promotionAccess, {
    type: 'memory',
    idempotencyKey: `promotion:${source.id}:${destination.id}`,
    title: input.title?.trim() || sourceView.title,
    content,
    origin: 'promotion',
    contentKind: source.contentKind,
  });
  if (!idempotent) {
    await db.insert(schema.agentMemoryEvidenceLinks).values({
      memoryRecordId: record.memoryId,
      evidenceRecordId: source.id,
      relation: 'promotion',
    }).onConflictDoNothing();
  }
  return { record };
}
