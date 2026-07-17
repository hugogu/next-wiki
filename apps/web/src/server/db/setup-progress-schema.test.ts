import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { resetSetupOnboardingState, createAdminUser } from '../../../test/setup-onboarding-fixtures';

describe('setup_progress schema', () => {
  beforeAll(async () => {
    await resetSetupOnboardingState();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('applies status defaults on the singleton row', async () => {
    const [row] = await db
      .insert(schema.setupProgress)
      .values({ id: 'default' })
      .returning();
    expect(row).toBeDefined();
    expect(row!.accountStatus).toBe('needed');
    expect(row!.aiStatus).toBe('not_started');
    expect(row!.samplePagesStatus).toBe('not_started');
    expect(row!.currentStep).toBe('account');
    expect(row!.adminUserId).toBeNull();
    expect(row!.aiActionId).toBeNull();
    expect(row!.aiResult).toBeNull();
    expect(row!.samplePagesResult).toBeNull();
    expect(row!.completedAt).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
    expect(row!.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a second non-singleton row via the check constraint', async () => {
    await expect(
      db.insert(schema.setupProgress).values({ id: 'other' }),
    ).rejects.toThrow(/setup_progress_singleton_id/);
  });

  it('references the admin user and ai action with set-null behavior', async () => {
    const { userId } = await createAdminUser();
    const expiresAt = new Date(Date.now() + 60_000);
    const [action] = await db
      .insert(schema.aiActions)
      .values({ feature: 'model_sync', actorUserId: userId, expiresAt })
      .returning();

    await db
      .update(schema.setupProgress)
      .set({ adminUserId: userId, aiActionId: action!.id })
      .where(eq(schema.setupProgress.id, 'default'));

    const linked = await db.query.setupProgress.findFirst({
      where: eq(schema.setupProgress.id, 'default'),
    });
    expect(linked?.adminUserId).toBe(userId);
    expect(linked?.aiActionId).toBe(action!.id);

    await db.delete(schema.aiActions).where(eq(schema.aiActions.id, action!.id));
    const afterActionDelete = await db.query.setupProgress.findFirst({
      where: eq(schema.setupProgress.id, 'default'),
    });
    expect(afterActionDelete?.aiActionId).toBeNull();

    await db.delete(schema.users).where(eq(schema.users.id, userId));
    const afterUserDelete = await db.query.setupProgress.findFirst({
      where: eq(schema.setupProgress.id, 'default'),
    });
    expect(afterUserDelete?.adminUserId).toBeNull();
  });

  it('round-trips JSON result fields without credentials', async () => {
    const aiResult = {
      wiki_text: { status: 'configured', modelId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a001', modelName: 'Example Chat' },
      wiki_embedding: { status: 'unavailable', reason: 'No compatible detected model' },
      wiki_image: { status: 'needs_manual_setup' },
    };
    const samplePagesResult = [
      { path: 'welcome', status: 'updated', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a002' },
      { path: 'help/markdown-syntax', status: 'collision', reason: 'exists' },
    ];
    await db
      .update(schema.setupProgress)
      .set({ aiResult, samplePagesResult })
      .where(eq(schema.setupProgress.id, 'default'));
    const row = await db.query.setupProgress.findFirst({
      where: eq(schema.setupProgress.id, 'default'),
    });
    expect(row?.aiResult).toEqual(aiResult);
    expect(row?.samplePagesResult).toEqual(samplePagesResult);
  });
});
