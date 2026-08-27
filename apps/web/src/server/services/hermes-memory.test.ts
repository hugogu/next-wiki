import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as apiKeyService from '@/server/services/api-keys';
import * as hermesMemory from '@/server/services/hermes-memory';
import { resetSetupOnboardingState, createAdminUser } from '../../../test/setup-onboarding-fixtures';

async function createMemoryActor(name: string) {
  const { userId } = await createAdminUser({ email: `${name}-${crypto.randomUUID()}@example.com` });
  const created = await apiKeyService.create(
    buildUserCtx(userId, 'admin'),
    name,
    ['memory.read', 'memory.write', 'memory.delete'],
    ['wiki'],
    { displayName: name },
  );
  return {
    created,
    ctx: buildApiKeyCtx(userId, 'admin', created.scopes, created.id),
  };
}

describe('Hermes memory service', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('writes private revision-backed memory, recalls it with a citation, and softly forgets it', async () => {
    const { ctx } = await createMemoryActor('personal');
    const saved = await hermesMemory.save(ctx, {
      idempotencyKey: 'decision-1',
      title: 'Architecture decision',
      content: 'Use a dedicated next-wiki Hermes memory destination.',
      tags: ['architecture', 'memory'],
    });
    const repeated = await hermesMemory.save(ctx, {
      idempotencyKey: 'decision-1',
      title: 'Architecture decision',
      content: 'Use a dedicated next-wiki Hermes memory destination.',
      tags: ['architecture', 'memory'],
    });

    expect(saved.idempotent).toBe(false);
    expect(repeated).toMatchObject({ idempotent: true, record: { memoryId: saved.record.memoryId } });
    expect(saved.record.citation.canonicalUrl).toContain('/');

    await expect(hermesMemory.save(ctx, {
      idempotencyKey: 'decision-1', content: 'different content',
    })).rejects.toMatchObject({ code: 'CONFLICT' });

    const record = await db.query.hermesMemoryRecords.findFirst({ where: eq(schema.hermesMemoryRecords.id, saved.record.memoryId) });
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, record!.pageId) });
    expect(page).toMatchObject({ visibility: 'restricted', nature: 'original' });
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, record!.currentRevisionId) });
    expect(revision?.contentSource).toContain('tags:\n  - architecture\n  - memory');

    await expect(hermesMemory.recall(ctx, 'dedicated Wiki destination', 5)).resolves.toEqual([
      expect.objectContaining({ memoryId: saved.record.memoryId, citation: expect.objectContaining({ revisionId: expect.any(String) }) }),
    ]);

    const forgotten = await hermesMemory.forget(ctx, saved.record.memoryId);
    expect(forgotten.state).toBe('forgotten');
    const stored = await db.query.hermesMemoryRecords.findFirst({ where: eq(schema.hermesMemoryRecords.id, saved.record.memoryId) });
    expect(stored?.state).toBe('forgotten');
    const deleted = await db.query.pages.findFirst({ where: and(eq(schema.pages.id, record!.pageId), isNull(schema.pages.deletedAt)) });
    expect(deleted).toBeUndefined();
  });

  it('does not expose a record across dedicated destinations', async () => {
    const first = await createMemoryActor('first');
    const second = await createMemoryActor('second');
    const saved = await hermesMemory.save(first.ctx, { idempotencyKey: 'first-only', content: 'a private decision' });

    await expect(hermesMemory.recall(second.ctx, 'private decision', 5)).resolves.toEqual([]);
    await expect(hermesMemory.forget(second.ctx, saved.record.memoryId)).rejects.toMatchObject({ code: 'HERMES_MEMORY_RECORD_NOT_FOUND' });
  });
});
