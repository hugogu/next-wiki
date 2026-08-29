import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as apiKeyService from '@/server/services/api-keys';
import * as agentMemory from '@/server/services/agent-memory';
import * as publicContent from '@/server/services/public-content';
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
    const { ctx, userId } = await createMemoryActor('personal');
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
    expect(revision?.sourceMetadata).toMatchObject({ inputKind: 'manual-note', provider: 'agent-memory', agentIdentity: 'hermes', apiKeyName: 'personal', tags: ['architecture', 'memory'] });
    expect(page?.path).toMatch(/^agent-memory\/hermes\/memory\/[a-f0-9]{64}$/);
    await expect(publicContent.getRevision(buildUserCtx(userId, 'admin'), page!.id, 1)).resolves.toMatchObject({ source: { apiKeyName: 'personal' } });

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
    await agentMemory.runEvidenceCapture({ captureId: submitted.captureId, messages: input.messages });

    await expect(agentMemory.recall(ctx, 'captured retry policy', 5)).resolves.toEqual([
      expect.objectContaining({
        type: 'evidence',
        title: expect.stringMatching(/^Agent conversation · \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC · Remember the captured retry policy\.$/),
        excerpt: expect.stringContaining('captured retry policy'),
      }),
    ]);
  });

  it('appends later captures from one session to the same Raw conversation page', async () => {
    const { ctx } = await createMemoryActor('capture-continuity');
    const sessionDigest = 'f'.repeat(64);
    const send = vi.fn().mockResolvedValue('job-capture-continuity');
    setBoss({ send } as never);

    const firstInput = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest,
      checkpoint: false,
      messages: [{ role: 'user' as const, content: 'We chose PostgreSQL for the memory index.' }],
    };
    const secondInput = {
      idempotencyKey: `capture-${crypto.randomUUID()}`,
      sessionDigest,
      checkpoint: true,
      messages: [{ role: 'assistant' as const, content: 'The next step is to document the migration.' }],
    };

    const first = await agentMemory.submitEvidenceCapture(ctx, firstInput);
    await agentMemory.runEvidenceCapture({ captureId: first.captureId, messages: firstInput.messages });
    const second = await agentMemory.submitEvidenceCapture(ctx, secondInput);
    await agentMemory.runEvidenceCapture({ captureId: second.captureId, messages: secondInput.messages });

    const records = await db.query.agentMemoryRecords.findMany({
      where: eq(schema.agentMemoryRecords.sourceSessionDigest, sessionDigest),
    });
    expect(records).toHaveLength(1);
    const record = records[0]!;
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, record.pageId) });
    const revisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, record.pageId),
      orderBy: (rows, { asc }) => [asc(rows.versionNumber)],
    });
    expect(page?.path).toMatch(/^agent-memory\/hermes\/conversation\/[a-f0-9]{64}$/);
    expect(revisions).toHaveLength(2);
    expect(revisions[1]?.contentSource).toContain('We chose PostgreSQL for the memory index.');
    expect(revisions[1]?.contentSource).toContain('The next step is to document the migration.');
    expect(record.currentRevisionId).toBe(revisions[1]?.id);

    const firstCapture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, first.captureId) });
    const secondCapture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, second.captureId) });
    expect(firstCapture?.evidenceRevisionId).toBe(revisions[0]?.id);
    expect(secondCapture?.evidenceRevisionId).toBe(revisions[1]?.id);

    // A worker may restart after the Raw append but before the capture ledger
    // becomes durable. The capture id in Raw provenance lets the retry recover
    // the original revision without appending the same chunk again.
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'running' })
      .where(eq(schema.agentMemoryCaptures.id, first.captureId));
    await agentMemory.runEvidenceCapture({ captureId: first.captureId, messages: firstInput.messages });
    const recoveredRevisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, record.pageId),
    });
    expect(recoveredRevisions).toHaveLength(2);

    await expect(agentMemory.getEvidenceCapture(ctx, first.captureId)).resolves.toMatchObject({
      status: 'durable',
      evidence: { evidenceId: record.id, citation: { pageId: record.pageId, revisionId: revisions[0]?.id } },
    });
    await expect(agentMemory.getEvidenceCapture(ctx, second.captureId)).resolves.toMatchObject({
      status: 'durable',
      evidence: { evidenceId: record.id, citation: { pageId: record.pageId, revisionId: revisions[1]?.id } },
    });
  });

  it('does not expose a record across dedicated destinations', async () => {
    const first = await createMemoryActor('first');
    const second = await createMemoryActor('second');
    const saved = await agentMemory.save(first.ctx, { idempotencyKey: 'first-only', content: 'a private decision' });

    await expect(agentMemory.recall(second.ctx, 'private decision', 5)).resolves.toEqual([]);
    await expect(agentMemory.forget(second.ctx, saved.record.memoryId)).rejects.toMatchObject({ code: 'AGENT_MEMORY_RECORD_NOT_FOUND' });
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
      { captureId: first.captureId, messages: input.messages },
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
