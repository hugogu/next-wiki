import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as apiKeyService from '@/server/services/api-keys';
import * as agentMemory from '@/server/services/agent-memory';
import * as agentMemoryGrants from '@/server/services/agent-memory-grants';
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

describe('Agent memory service', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    // Raw entries are governed by the shared Raw-space writer, which is only
    // available while the instance is in LLM Wiki mode.
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

  it('writes immutable Raw memory, recalls it with a citation, and hides it on forget', async () => {
    const { ctx } = await createMemoryActor('personal');
    const saved = await agentMemory.save(ctx, {
      idempotencyKey: 'decision-1',
      title: 'Architecture decision',
      content: 'Use a dedicated next-wiki Agent memory destination.',
      tags: ['architecture', 'memory'],
    });
    const repeated = await agentMemory.save(ctx, {
      idempotencyKey: 'decision-1',
      title: 'Architecture decision',
      content: 'Use a dedicated next-wiki Agent memory destination.',
      tags: ['architecture', 'memory'],
    });

    expect(saved.idempotent).toBe(false);
    expect(repeated).toMatchObject({ idempotent: true, record: { memoryId: saved.record.memoryId } });
    expect(saved.record.citation.canonicalUrl).toContain('/');

    await expect(agentMemory.save(ctx, {
      idempotencyKey: 'decision-1', content: 'different content',
    })).rejects.toMatchObject({ code: 'CONFLICT' });

    const record = await db.query.agentMemoryRecords.findFirst({ where: eq(schema.agentMemoryRecords.id, saved.record.memoryId) });
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, record!.pageId) });
    const rawSpace = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'raw') });
    expect(page).toMatchObject({ spaceId: rawSpace!.id, visibility: 'restricted', nature: 'original' });
    expect(page?.rawCategoryId).toBeTruthy();
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, record!.currentRevisionId) });
    expect(revision?.contentSource).toBe('Use a dedicated next-wiki Agent memory destination.');
    expect(revision?.sourceMetadata).toMatchObject({ inputKind: 'manual-note', provider: 'agent-memory', agentIdentity: 'hermes', tags: ['architecture', 'memory'] });

    await expect(agentMemory.recall(ctx, 'dedicated Wiki destination', 5)).resolves.toEqual([
      expect.objectContaining({ memoryId: saved.record.memoryId, citation: expect.objectContaining({ revisionId: expect.any(String) }) }),
    ]);

    const forgotten = await agentMemory.forget(ctx, saved.record.memoryId);
    expect(forgotten.state).toBe('forgotten');
    const stored = await db.query.agentMemoryRecords.findFirst({ where: eq(schema.agentMemoryRecords.id, saved.record.memoryId) });
    expect(stored?.state).toBe('forgotten');
    const deleted = await db.query.pages.findFirst({ where: and(eq(schema.pages.id, record!.pageId), isNull(schema.pages.deletedAt)) });
    expect(deleted).toBeDefined();
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

    const submitted = await agentMemory.submitEvidenceCapture(ctx, input);
    await agentMemory.runEvidenceCapture({ captureId: submitted.captureId });

    await expect(agentMemory.recall(ctx, 'captured retry policy', 5)).resolves.toEqual([
      expect.objectContaining({
        type: 'evidence',
        title: 'Agent conversation evidence',
        excerpt: expect.stringContaining('captured retry policy'),
      }),
    ]);
  });

  it('does not expose a record across dedicated destinations', async () => {
    const first = await createMemoryActor('first');
    const second = await createMemoryActor('second');
    const saved = await agentMemory.save(first.ctx, { idempotencyKey: 'first-only', content: 'a private decision' });

    await expect(agentMemory.recall(second.ctx, 'private decision', 5)).resolves.toEqual([]);
    await expect(agentMemory.forget(second.ctx, saved.record.memoryId)).rejects.toMatchObject({ code: 'AGENT_MEMORY_RECORD_NOT_FOUND' });
  });

  it('uses explicit grants for cross-agent recall and shared writes', async () => {
    const owner = await createAdminUser({ email: `v2-grants-${crypto.randomUUID()}@example.com` });
    const first = await createMemoryActor('v2-first', undefined, { userId: owner.userId, agentIdentity: 'first' });
    const second = await createMemoryActor('v2-second', undefined, { userId: owner.userId, agentIdentity: 'second' });
    const firstDestinationId = first.created.memoryDestination!.id;
    const secondConnectionId = second.created.memoryDestination!.connectionId!;

    await db.update(schema.agentMemoryNamespaces)
      .set({ role: 'shared' })
      .where(eq(schema.agentMemoryNamespaces.id, firstDestinationId));
    await agentMemoryGrants.createGrant(buildUserCtx(owner.userId, 'admin'), {
      connectionId: secondConnectionId,
      destinationId: firstDestinationId,
      capability: 'read',
    });
    await agentMemoryGrants.createGrant(buildUserCtx(owner.userId, 'admin'), {
      connectionId: secondConnectionId,
      destinationId: firstDestinationId,
      capability: 'write',
    });

    const saved = await agentMemory.saveV2(first.ctx, {
      idempotencyKey: 'v2-shared-record',
      content: 'Shared release decision for both agents.',
      role: 'synthesis',
      origin: 'explicit_save',
    });
    expect(saved.record.destinationRole).toBe('shared');
    await expect(agentMemory.recallV2(second.ctx, {
      query: 'release decision',
      scope: 'granted',
      limit: 5,
    })).resolves.toEqual([expect.objectContaining({ memoryId: saved.record.memoryId, authorConnectionId: first.created.memoryDestination!.connectionId })]);

    const secondSave = await agentMemory.saveV2(second.ctx, {
      idempotencyKey: 'v2-second-shared-write',
      content: 'Second agent shared update.',
      role: 'synthesis',
      origin: 'explicit_save',
    });
    expect(secondSave.record.destinationRole).toBe('shared');
  });

  it('isolates records and captures by agent identity within a shared destination', async () => {
    const hermes = await createMemoryActor('shared-hermes', undefined, { agentIdentity: 'hermes' });
    const mino = await createMemoryActor('shared-mino', undefined, {
      userId: hermes.userId,
      agentIdentity: 'mino',
      sharedNamespaceId: hermes.created.memoryDestination!.id,
    });

    const hermesRecord = await agentMemory.save(hermes.ctx, {
      idempotencyKey: 'shared-idempotency-key',
      content: 'Hermes-only decision',
    });
    const minoRecord = await agentMemory.save(mino.ctx, {
      idempotencyKey: 'shared-idempotency-key',
      content: 'Mino-only decision',
    });

    expect(minoRecord.record.memoryId).not.toBe(hermesRecord.record.memoryId);
    await expect(agentMemory.recall(hermes.ctx, 'Mino-only', 5)).resolves.toEqual([]);
    await expect(agentMemory.recall(mino.ctx, 'Hermes-only', 5)).resolves.toEqual([]);

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
    const hermesCapture = await agentMemory.submitEvidenceCapture(hermes.ctx, evidence);
    const minoCapture = await agentMemory.submitEvidenceCapture(mino.ctx, evidence);
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

  it('allows diagnostics with any dedicated memory scope', async () => {
    const { ctx } = await createMemoryActor('diagnostics-delete-only', ['memory.delete']);

    await expect(agentMemory.getDiagnostics(ctx)).resolves.toMatchObject({
      status: 'healthy',
      grantedScopes: ['memory.delete'],
    });
  });

  it('re-enqueues a failed capture with the same idempotency key', async () => {
    const { ctx } = await createMemoryActor('capture-retry');
    const input = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest: 'a'.repeat(64),
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'Retry this evidence.' }],
    };

    const first = await agentMemory.submitEvidenceCapture(ctx, input);
    expect(first).toMatchObject({ status: 'failed', idempotent: false });

    const send = vi.fn().mockResolvedValue('job-retry-1');
    setBoss({ send } as never);
    const retry = await agentMemory.submitEvidenceCapture(ctx, input);
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
    await agentMemory.submitEvidenceCapture(ctx, input);

    await expect(agentMemory.submitEvidenceCapture(ctx, {
      ...input,
      messages: [{ role: 'user', content: 'Different evidence.' }],
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
