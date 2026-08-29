import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as agentMemory from '@/server/services/agent-memory';
import * as management from '@/server/services/agent-memory-management';
import * as permissions from '@/server/permissions/agent-memory';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { resetSetupOnboardingState, createAdminUser } from '../../../test/setup-onboarding-fixtures';
import { ensureRawSpaceForConversations } from '../../../test/ai-fixtures';
import { setModeInternal } from '@/server/services/writing-mode';

const CONNECTION_SCOPES = ['memory.read', 'memory.write', 'memory.delete'] as const;

async function ownerCtx(email: string) {
  const { userId } = await createAdminUser({ email });
  return { userId, ctx: buildUserCtx(userId, 'admin') };
}

async function connectionCtx(userId: string, keyId: string) {
  return buildApiKeyCtx(userId, 'admin', [...CONNECTION_SCOPES], keyId);
}

describe('Agent memory management service', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureRawSpaceForConversations();
    await setModeInternal('llm-wiki', null);
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provisions an isolated connection whose credential can save and recall privately', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const created = await management.createConnection(ctx, { displayName: 'OpenClaw laptop' });
    expect(created.connection.state).toBe('active');
    expect(created.keySecret).toBeTruthy();

    const agentCtx = await connectionCtx(userId, created.keyId);
    const saved = await agentMemory.save(agentCtx, { idempotencyKey: 'k1', content: 'connection-scoped note' });
    await expect(agentMemory.recall(agentCtx, 'connection-scoped', 5)).resolves.toEqual([
      expect.objectContaining({ memoryId: saved.record.memoryId }),
    ]);
  });

  it('denies further access once a connection is disabled or revoked', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const created = await management.createConnection(ctx, { displayName: 'disable-me' });
    const agentCtx = await connectionCtx(userId, created.keyId);
    await agentMemory.save(agentCtx, { idempotencyKey: 'k1', content: 'before disable' });

    await management.disableConnection(ctx, created.connection.connectionId);
    await expect(agentMemory.save(agentCtx, { idempotencyKey: 'k2', content: 'after disable' }))
      .rejects.toMatchObject({ code: 'AGENT_MEMORY_NAMESPACE_UNAVAILABLE' });
  });

  it('rotates a credential without invalidating the prior one', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const created = await management.createConnection(ctx, { displayName: 'rotate-me' });
    const rotated = await management.rotateCredential(ctx, created.connection.connectionId);
    expect(rotated.keyId).not.toBe(created.keyId);

    const originalCtx = await connectionCtx(userId, created.keyId);
    const rotatedCtx = await connectionCtx(userId, rotated.keyId);
    await expect(agentMemory.save(originalCtx, { idempotencyKey: 'k1', content: 'still valid' })).resolves.toBeDefined();
    await expect(agentMemory.save(rotatedCtx, { idempotencyKey: 'k2', content: 'also valid' })).resolves.toBeDefined();
  });

  it('grants deliberate shared recall, revokes it, and never lets an agent create its own grant', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const source = await management.createConnection(ctx, { displayName: 'source' });
    const reader = await management.createConnection(ctx, { displayName: 'reader' });
    const sourceCtx = await connectionCtx(userId, source.keyId);
    const readerCtx = await connectionCtx(userId, reader.keyId);

    const saved = await agentMemory.save(sourceCtx, { idempotencyKey: 'k1', content: 'a decision worth sharing' });

    // Reader cannot see it by default, nor with an unrecognized scope.
    await expect(agentMemory.recall(readerCtx, 'decision worth sharing', 5, 'own_and_granted')).resolves.toEqual([]);

    const shared = await management.createSharedDestination(ctx, { displayName: 'Team knowledge' });
    const promoted = await management.promote(ctx, { sourceRecordId: saved.record.memoryId, destinationId: shared.id });
    expect(promoted.record.origin).toBe('promotion');

    // No grant yet: still invisible to the reader connection.
    await expect(agentMemory.recall(readerCtx, 'decision worth sharing', 5, 'granted')).resolves.toEqual([]);

    const grant = await management.createGrant(ctx, shared.id, { granteeConnectionId: reader.connection.connectionId });
    expect(grant.state).toBe('active');

    await expect(agentMemory.recall(readerCtx, 'decision worth sharing', 5, 'granted')).resolves.toEqual([
      expect.objectContaining({ memoryId: promoted.record.memoryId }),
    ]);
    // The source connection's own recall is unaffected by the promotion/grant.
    await expect(agentMemory.recall(sourceCtx, 'decision worth sharing', 5, 'own')).resolves.toEqual([
      expect.objectContaining({ memoryId: saved.record.memoryId }),
    ]);

    await management.revokeGrant(ctx, grant.grantId);
    await expect(agentMemory.recall(readerCtx, 'decision worth sharing', 5, 'granted')).resolves.toEqual([]);
  });

  it('omits a result without disclosure when its grant is revoked between candidate selection and output (FR-009)', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const source = await management.createConnection(ctx, { displayName: 'source' });
    const reader = await management.createConnection(ctx, { displayName: 'reader' });
    const sourceCtx = await connectionCtx(userId, source.keyId);
    const readerCtx = await connectionCtx(userId, reader.keyId);

    const saved = await agentMemory.save(sourceCtx, { idempotencyKey: 'k1', content: 'mid-flight revocation target' });
    const shared = await management.createSharedDestination(ctx, { displayName: 'Team knowledge' });
    await management.promote(ctx, { sourceRecordId: saved.record.memoryId, destinationId: shared.id });
    const grant = await management.createGrant(ctx, shared.id, { granteeConnectionId: reader.connection.connectionId });

    // recall() calls listActiveGrantedDestinationIds once to expand candidates
    // and again immediately before returning (FR-009). Revoke the grant after
    // the first call resolves, simulating a revocation that lands in the
    // window between candidate selection and output.
    const original = permissions.listActiveGrantedDestinationIds;
    let calls = 0;
    vi.spyOn(permissions, 'listActiveGrantedDestinationIds').mockImplementation(async (connectionId: string) => {
      const result = await original(connectionId);
      calls += 1;
      if (calls === 1) {
        await management.revokeGrant(ctx, grant.grantId);
      }
      return result;
    });

    await expect(agentMemory.recall(readerCtx, 'mid-flight revocation', 5, 'granted')).resolves.toEqual([]);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('never surfaces a result from an expired grant', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const source = await management.createConnection(ctx, { displayName: 'source' });
    const reader = await management.createConnection(ctx, { displayName: 'reader' });
    const sourceCtx = await connectionCtx(userId, source.keyId);
    const readerCtx = await connectionCtx(userId, reader.keyId);

    const saved = await agentMemory.save(sourceCtx, { idempotencyKey: 'k1', content: 'expired grant target' });
    const shared = await management.createSharedDestination(ctx, { displayName: 'Team knowledge' });
    await management.promote(ctx, { sourceRecordId: saved.record.memoryId, destinationId: shared.id });
    await management.createGrant(ctx, shared.id, {
      granteeConnectionId: reader.connection.connectionId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(agentMemory.recall(readerCtx, 'expired grant', 5, 'granted')).resolves.toEqual([]);
  });

  it('omits a granted result whose backing page has been deleted, without a distinguishable error', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const source = await management.createConnection(ctx, { displayName: 'source' });
    const reader = await management.createConnection(ctx, { displayName: 'reader' });
    const sourceCtx = await connectionCtx(userId, source.keyId);
    const readerCtx = await connectionCtx(userId, reader.keyId);

    const saved = await agentMemory.save(sourceCtx, { idempotencyKey: 'k1', content: 'soon to be deleted' });
    const shared = await management.createSharedDestination(ctx, { displayName: 'Team knowledge' });
    const promoted = await management.promote(ctx, { sourceRecordId: saved.record.memoryId, destinationId: shared.id });
    await management.createGrant(ctx, shared.id, { granteeConnectionId: reader.connection.connectionId });

    await expect(agentMemory.recall(readerCtx, 'soon to be deleted', 5, 'granted')).resolves.toEqual([
      expect.objectContaining({ memoryId: promoted.record.memoryId }),
    ]);

    const record = await db.query.agentMemoryRecords.findFirst({ where: eq(schema.agentMemoryRecords.id, promoted.record.memoryId) });
    await db.update(schema.pages).set({ deletedAt: new Date() }).where(eq(schema.pages.id, record!.pageId));

    await expect(agentMemory.recall(readerCtx, 'soon to be deleted', 5, 'granted')).resolves.toEqual([]);
  });

  it('rejects grant and promotion attempts from a non-owner (agent) actor', async () => {
    const { userId, ctx } = await ownerCtx(`owner-${crypto.randomUUID()}@example.com`);
    const created = await management.createConnection(ctx, { displayName: 'agent' });
    const agentCtx = await connectionCtx(userId, created.keyId);

    await expect(management.createSharedDestination(agentCtx, { displayName: 'sneaky' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(management.createGrant(agentCtx, created.connection.connectionId, { granteeConnectionId: created.connection.connectionId }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    const saved = await agentMemory.save(agentCtx, { idempotencyKey: 'k1', content: 'agent-authored note' });
    await expect(management.promote(agentCtx, { sourceRecordId: saved.record.memoryId, destinationId: created.connection.connectionId }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
