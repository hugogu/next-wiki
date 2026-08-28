import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';

function requireOwner(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only the Wiki owner can manage Agent Memory retention');
  }
  return ctx.actor.userId;
}

export async function setRetentionPolicy(ctx: PermCtx, destinationId: string, retentionDays: number) {
  const ownerUserId = requireOwner(ctx);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3_650) {
    throw new DomainError('BAD_REQUEST', 'Retention must be between 1 and 3650 days');
  }
  const destination = await db.query.agentMemoryNamespaces.findFirst({
    where: and(eq(schema.agentMemoryNamespaces.id, destinationId), eq(schema.agentMemoryNamespaces.ownerUserId, ownerUserId)),
  });
  if (!destination) throw new DomainError('NOT_FOUND', 'Agent Memory destination not found');
  const existing = await db.query.agentMemoryRetentionPolicies.findFirst({
    where: eq(schema.agentMemoryRetentionPolicies.destinationId, destinationId),
  });
  const policyVersion = (existing?.policyVersion ?? 0) + 1;
  const [policy] = await db.insert(schema.agentMemoryRetentionPolicies).values({
    destinationId,
    ownerUserId,
    retentionDays,
    policyVersion,
  }).onConflictDoUpdate({
    target: schema.agentMemoryRetentionPolicies.destinationId,
    set: { retentionDays, policyVersion, updatedAt: new Date() },
  }).returning();
  if (!policy) throw new Error('AGENT_MEMORY_RETENTION_UPDATE_FAILED');
  return {
    destinationId: policy.destinationId,
    retentionDays: policy.retentionDays,
    policyVersion: policy.policyVersion,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export async function getRetentionPolicy(ctx: PermCtx, destinationId: string) {
  const ownerUserId = requireOwner(ctx);
  const destination = await db.query.agentMemoryNamespaces.findFirst({
    where: and(eq(schema.agentMemoryNamespaces.id, destinationId), eq(schema.agentMemoryNamespaces.ownerUserId, ownerUserId)),
  });
  if (!destination) throw new DomainError('NOT_FOUND', 'Agent Memory destination not found');
  const policy = await db.query.agentMemoryRetentionPolicies.findFirst({
    where: eq(schema.agentMemoryRetentionPolicies.destinationId, destinationId),
  });
  return policy
    ? { destinationId, retentionDays: policy.retentionDays, policyVersion: policy.policyVersion, updatedAt: policy.updatedAt.toISOString() }
    : { destinationId, retentionDays: null, policyVersion: 0, updatedAt: null };
}
