import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as apiKeyService from '@/server/services/api-keys';
import * as agentMemory from '@/server/services/agent-memory';
import * as agentMemoryCaptures from '@/server/services/agent-memory-captures';
import { setBoss } from '@/server/jobs/runtime';
import { resetSetupOnboardingState, createAdminUser } from '../../../test/setup-onboarding-fixtures';
import { ensureRawSpaceForConversations } from '../../../test/ai-fixtures';
import { setModeInternal } from '@/server/services/writing-mode';

async function createMemoryActor(
  name: string,
  scopes: ('memory.read' | 'memory.write' | 'memory.delete')[] = ['memory.read', 'memory.write', 'memory.delete'],
  options: { agentIdentity?: string; sharedNamespaceId?: string; userId?: string } = {},
) {
  const userId = options.userId ?? (await createAdminUser({ email: `${name}-${crypto.randomUUID()}@example.com` })).userId;
  const created = await apiKeyService.create(
    buildUserCtx(userId, 'admin'),
    name,
    scopes,
    ['wiki'],
    {
      agentIdentity: options.agentIdentity ?? 'hermes',
      ...(options.sharedNamespaceId ? { sharedNamespaceId: options.sharedNamespaceId } : { displayName: name }),
    },
  );
  return {
    userId,
    created,
    ctx: buildApiKeyCtx(userId, 'admin', created.scopes, created.id),
  };
}

describe('Agent memory capture service', () => {
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
    setBoss(null);
  });

  it('recalls durable automatic-capture evidence without a synthesis step', async () => {
    const { ctx } = await createMemoryActor('capture-recall');
    const input = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest: 'c'.repeat(64),
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'Remember the captured retry policy.' }],
    };
    const send = vi.fn().mockResolvedValue('job-capture-recall');
    setBoss({ send } as never);

    const submitted = await agentMemoryCaptures.submitEvidenceCapture(ctx, input);
    // The pg-boss job carries the capture ID only; the worker fetches the
    // encrypted envelope from the capture row itself.
    expect(send).toHaveBeenCalledWith('agent-memory-capture', { captureId: submitted.captureId }, expect.any(Object));
    await agentMemoryCaptures.runEvidenceCapture({ captureId: submitted.captureId });

    await expect(agentMemory.recall(ctx, 'captured retry policy', 5)).resolves.toEqual([
      expect.objectContaining({
        type: 'evidence',
        title: expect.stringMatching(/^Agent conversation · \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC · Remember the captured retry policy\.$/),
        excerpt: expect.stringContaining('captured retry policy'),
      }),
    ]);

    const capture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, submitted.captureId) });
    expect(capture).toMatchObject({ status: 'durable', payloadEncrypted: null, payloadExpiresAt: null });
  });

  it('isolates captures by agent identity within a shared destination', async () => {
    const hermes = await createMemoryActor('shared-hermes-capture', undefined, { agentIdentity: 'hermes' });
    const mino = await createMemoryActor('shared-mino-capture', undefined, {
      userId: hermes.userId,
      agentIdentity: 'mino',
      sharedNamespaceId: hermes.created.memoryDestination!.id,
    });

    const send = vi.fn()
      .mockResolvedValueOnce('job-hermes')
      .mockResolvedValueOnce('job-mino');
    setBoss({ send } as never);
    const evidence = {
      idempotencyKey: 'shared-capture-key',
      sessionDigest: 'c'.repeat(64),
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'shared evidence' }],
    };
    const hermesCapture = await agentMemoryCaptures.submitEvidenceCapture(hermes.ctx, evidence);
    const minoCapture = await agentMemoryCaptures.submitEvidenceCapture(mino.ctx, evidence);
    expect(hermesCapture.captureId).not.toBe(minoCapture.captureId);
    expect(send).toHaveBeenCalledTimes(2);

    const captures = await db.query.agentMemoryCaptures.findMany({
      where: eq(schema.agentMemoryCaptures.namespaceId, hermes.created.memoryDestination!.id),
    });
    expect(captures).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: hermesCapture.captureId, agentIdentity: 'hermes' }),
      expect.objectContaining({ id: minoCapture.captureId, agentIdentity: 'mino' }),
    ]));
  });

  it('re-enqueues a failed capture with the same idempotency key', async () => {
    const { ctx } = await createMemoryActor('capture-retry');
    const input = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest: 'a'.repeat(64),
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'Retry this evidence.' }],
    };

    const first = await agentMemoryCaptures.submitEvidenceCapture(ctx, input);
    expect(first).toMatchObject({ status: 'failed', idempotent: false });

    const send = vi.fn().mockResolvedValue('job-retry-1');
    setBoss({ send } as never);
    const retry = await agentMemoryCaptures.submitEvidenceCapture(ctx, input);
    expect(retry).toMatchObject({ captureId: first.captureId, status: 'queued', idempotent: true });
    expect(send).toHaveBeenCalledWith(
      'agent-memory-capture',
      { captureId: first.captureId },
      {
        singletonKey: first.captureId,
        singletonSeconds: 60,
        retryLimit: 5,
        retryDelay: 15,
        retryBackoff: true,
        retryDelayMax: 300,
      },
    );
  });

  it('rejects idempotency-key reuse when the evidence payload changes', async () => {
    const { ctx } = await createMemoryActor('capture-conflict');
    const input = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest: 'b'.repeat(64),
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'Original evidence.' }],
    };
    await agentMemoryCaptures.submitEvidenceCapture(ctx, input);

    await expect(agentMemoryCaptures.submitEvidenceCapture(ctx, {
      ...input,
      messages: [{ role: 'user', content: 'Different evidence.' }],
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('produces at most one durable record across 100 consecutive retry simulations (SC-002)', async () => {
    const { ctx } = await createMemoryActor('capture-retry-stress');
    const input = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest: 'e'.repeat(64),
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'Idempotent retry stress evidence.' }],
    };
    const send = vi.fn().mockResolvedValue('job-stress');
    setBoss({ send } as never);

    const captureIds = new Set<string>();
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await agentMemoryCaptures.submitEvidenceCapture(ctx, input);
      captureIds.add(result.captureId);
    }
    expect(captureIds.size).toBe(1);
    const captureId = [...captureIds][0]!;

    // Simulate duplicate/restarted delivery of the same capture.
    for (let delivery = 0; delivery < 100; delivery++) {
      await agentMemoryCaptures.runEvidenceCapture({ captureId });
    }

    const records = await db.query.agentMemoryRecords.findMany({
      where: eq(schema.agentMemoryRecords.idempotencyKey, input.idempotencyKey),
    });
    expect(records).toHaveLength(1);
    const capture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, captureId) });
    expect(capture).toMatchObject({ status: 'durable' });
  });

  it('fails a capture whose transient envelope already expired', async () => {
    const { ctx } = await createMemoryActor('capture-expired');
    const input = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest: 'd'.repeat(64),
      checkpoint: true,
      messages: [{ role: 'user' as const, content: 'Checkpoint evidence.' }],
    };
    const send = vi.fn().mockResolvedValue('job-expired');
    setBoss({ send } as never);
    const submitted = await agentMemoryCaptures.submitEvidenceCapture(ctx, input);

    await db.update(schema.agentMemoryCaptures)
      .set({ payloadExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.agentMemoryCaptures.id, submitted.captureId));

    await agentMemoryCaptures.runEvidenceCapture({ captureId: submitted.captureId });

    const capture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, submitted.captureId) });
    expect(capture).toMatchObject({ status: 'failed', failureCode: 'AGENT_MEMORY_CAPTURE_ENVELOPE_EXPIRED', payloadEncrypted: null });
  });
});
