import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { Actor } from '@/server/permissions';
import {
  resetSetupOnboardingState,
  createAdminUser,
  readSetupProgress,
  SETUP_ADMIN_EMAIL,
} from '../../../test/setup-onboarding-fixtures';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => new Map()),
}));

import * as setupService from '@/server/services/setup';
import { getMode } from '@/server/services/writing-mode';

const anonymous: Actor = { kind: 'anonymous' };
const adminActor = (userId: string): Actor => ({ kind: 'user', userId, role: 'admin' });
const editorActor = (userId: string): Actor => ({ kind: 'user', userId, role: 'editor' });

describe('setupService', () => {
  beforeAll(async () => {
    await resetSetupOnboardingState();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  describe('state machine', () => {
    it('reports account-needed state when no admin exists', async () => {
      await resetSetupOnboardingState();
      const state = await setupService.getSetupState(anonymous);
      expect(state).toEqual({ needed: true, currentStep: 'account', accountStatus: 'needed' });
    });

    it('reports closed state when an admin predates onboarding progress', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      const state = await setupService.getSetupState(adminActor(userId));
      expect(state).toEqual({ needed: false, currentStep: 'closed' });
    });

    it('hides post-account detail from anonymous and non-admin callers', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      await db.insert(schema.setupProgress).values({
        id: 'default',
        adminUserId: userId,
        accountStatus: 'created',
        currentStep: 'ai',
      });
      const anonState = await setupService.getSetupState(anonymous);
      expect(anonState).toEqual({ needed: true, currentStep: 'account', accountStatus: 'created' });
      const editorState = await setupService.getSetupState(editorActor(userId));
      expect(editorState).toEqual({ needed: true, currentStep: 'account', accountStatus: 'created' });
      expect(JSON.stringify(anonState)).not.toContain('aiResult');
    });

    it('walks account → ai → writing_mode → sample_pages → summary with explicit choices', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      await db.insert(schema.setupProgress).values({
        id: 'default',
        adminUserId: userId,
        accountStatus: 'created',
        currentStep: 'ai',
      });

      await setupService.recordAiSkip();
      let progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('skipped');
      expect(progress?.currentStep).toBe('writing_mode');
      expect(progress?.aiResult).toMatchObject({
        wiki_text: { status: 'skipped' },
        wiki_embedding: { status: 'skipped' },
        wiki_image: { status: 'skipped' },
      });

      await setupService.recordWritingMode(adminActor(userId), 'llm-wiki');
      progress = await readSetupProgress();
      expect(progress?.currentStep).toBe('sample_pages');
      await expect(getMode()).resolves.toBe('llm-wiki');

      await setupService.recordSamplePagesSkip();
      progress = await readSetupProgress();
      expect(progress?.samplePagesStatus).toBe('skipped');
      expect(progress?.currentStep).toBe('summary');
      expect(progress?.completedAt).toBeInstanceOf(Date);

      const state = await setupService.getSetupState(adminActor(userId));
      expect(state.currentStep).toBe('summary');
      expect(state.needed).toBe(false);
      expect(state.summary).toEqual({
        adminCreated: true,
        ai: {
          wiki_text: { status: 'skipped' },
          wiki_embedding: { status: 'skipped' },
          wiki_image: { status: 'skipped' },
        },
        samplePages: [],
      });
    });

    it('keeps failed AI on the ai step and completed AI advances', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      await db.insert(schema.setupProgress).values({
        id: 'default',
        adminUserId: userId,
        accountStatus: 'created',
        currentStep: 'ai',
      });

      await setupService.recordAiTerminal({
        status: 'failed',
        result: { wiki_text: { status: 'failed', reason: 'boom' } },
      });
      let progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('failed');
      expect(progress?.currentStep).toBe('ai');

      await setupService.recordAiTerminal({
        status: 'completed',
        result: {
          wiki_text: { status: 'configured', modelName: 'Chat' },
          wiki_embedding: { status: 'configured', modelName: 'Embed' },
          wiki_image: { status: 'configured', modelName: 'Image' },
        },
      });
      progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('completed');
      expect(progress?.currentStep).toBe('writing_mode');
    });

    it('rejects setup mutations from non-admin or closed callers', async () => {
      await resetSetupOnboardingState();
      await expect(setupService.assertSetupAdmin(anonymous)).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const { userId } = await createAdminUser();
      await expect(setupService.assertSetupAdmin(editorActor(userId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      // Admin exists but no progress row → setup closed.
      await expect(setupService.assertSetupAdmin(adminActor(userId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('persists the selected writing mode and rejects invalid or out-of-step choices', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      await db.insert(schema.setupProgress).values({
        id: 'default',
        adminUserId: userId,
        accountStatus: 'created',
        currentStep: 'writing_mode',
        aiStatus: 'skipped',
      });

      await expect(setupService.recordWritingMode(adminActor(userId), 'copilot')).resolves.toMatchObject({
        currentStep: 'sample_pages',
      });
      await expect(getMode()).resolves.toBe('copilot');
      await expect(setupService.recordWritingMode(adminActor(userId), 'llm-wiki')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(setupService.recordWritingMode(adminActor(userId), 'invalid-mode')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(setupService.recordWritingMode(anonymous, 'llm-wiki')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('skips summary shaping of unknown aiResult keys', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      await db.insert(schema.setupProgress).values({
        id: 'default',
        adminUserId: userId,
        accountStatus: 'created',
        currentStep: 'summary',
        aiStatus: 'completed',
        aiResult: {
          wiki_text: { status: 'configured', modelName: 'Chat' },
          internalBookkeeping: { secret: 'nope' },
        } as unknown as Record<string, unknown>,
        completedAt: new Date(),
      });
      const state = await setupService.getSetupState(adminActor(userId));
      expect(state.summary?.ai).toEqual({ wiki_text: { status: 'configured', modelName: 'Chat' } });
      expect(JSON.stringify(state)).not.toContain('nope');
    });
  });

  describe('setupAdmin (US1)', () => {
    beforeAll(async () => {
      await resetSetupOnboardingState();
    });

    it('creates the first admin, session, and progress in one operation', async () => {
      const { userId } = await setupService.setupAdmin({
        email: SETUP_ADMIN_EMAIL,
        password: 'Password123!',
      });
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
      expect(user?.role).toBe('admin');
      expect(user?.status).toBe('active');
      expect(user?.passwordHash).not.toBe('Password123!');

      const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
      expect(sessions).toHaveLength(1);

      const progress = await readSetupProgress();
      expect(progress?.adminUserId).toBe(userId);
      expect(progress?.accountStatus).toBe('created');
      expect(progress?.currentStep).toBe('ai');
    });

    it('rejects a second admin after setup completed', async () => {
      await expect(
        setupService.setupAdmin({ email: 'second@example.com', password: 'Password123!' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects invalid passwords before touching the database', async () => {
      await expect(
        setupService.setupAdmin({ email: 'short@example.com', password: 'short' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects duplicate emails when no admin exists yet', async () => {
      await resetSetupOnboardingState();
      const passwordHash = '$2a$10$abcdefghijklmnopqrstuuVWQvV8Yk6M0y1Z0m0Z0m0Z0m0Z0m';
      await db.insert(schema.users).values({
        email: 'reader@example.com',
        passwordHash,
        role: 'reader',
        status: 'active',
      });
      await expect(
        setupService.setupAdmin({ email: 'reader@example.com', password: 'Password123!' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('creates exactly one admin under concurrent submissions', async () => {
      await resetSetupOnboardingState();
      const attempts = await Promise.allSettled([
        setupService.setupAdmin({ email: 'race-a@example.com', password: 'Password123!' }),
        setupService.setupAdmin({ email: 'race-b@example.com', password: 'Password123!' }),
        setupService.setupAdmin({ email: 'race-c@example.com', password: 'Password123!' }),
      ]);
      const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled');
      const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const attempt of rejected) {
        expect((attempt as PromiseRejectedResult).reason).toMatchObject({ code: 'FORBIDDEN' });
      }
      const admins = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, 'admin'));
      expect(admins).toHaveLength(1);
      const progress = await readSetupProgress();
      expect(progress?.accountStatus).toBe('created');
      expect(progress?.adminUserId).toBe(admins[0]!.id);
    });
  });

  describe('resume and idempotency (US4)', () => {
    beforeAll(async () => {
      await resetSetupOnboardingState();
    });

    it('resumes at ai after account creation refresh', async () => {
      await resetSetupOnboardingState();
      const { userId } = await setupService.setupAdmin({
        email: SETUP_ADMIN_EMAIL,
        password: 'Password123!',
      });
      const state = await setupService.getSetupState(adminActor(userId));
      expect(state).toMatchObject({
        needed: true,
        currentStep: 'ai',
        accountStatus: 'created',
        aiStatus: 'not_started',
        samplePagesStatus: 'not_started',
      });
      expect(state.summary).toEqual({ adminCreated: true, ai: null, samplePages: null });
    });

    it('resumes at writing_mode after a terminal AI outcome', async () => {
      const progress = await readSetupProgress();
      await setupService.recordAiTerminal({
        status: 'completed',
        result: {
          wiki_text: { status: 'configured', modelName: 'Chat' },
          wiki_embedding: { status: 'configured', modelName: 'Embed' },
          wiki_image: { status: 'configured', modelName: 'Image' },
        },
      });
      const state = await setupService.getSetupState(adminActor(progress!.adminUserId!));
      expect(state.currentStep).toBe('writing_mode');
      // Reset to not_started so the following skip tests exercise a real transition.
      await db
        .update(schema.setupProgress)
        .set({ aiStatus: 'not_started', aiResult: null, currentStep: 'ai' })
        .where(eq(schema.setupProgress.id, 'default'));
    });

    it('repeated AI skip is a no-op', async () => {
      await setupService.recordAiSkip();
      const first = await readSetupProgress();
      await setupService.recordAiSkip();
      const second = await readSetupProgress();
      expect(second?.aiStatus).toBe('skipped');
      expect(second?.aiResult).toEqual(first?.aiResult);
      expect(second?.currentStep).toBe('writing_mode');
    });

    it('repeated sample-pages skip is a no-op', async () => {
      await setupService.recordSamplePagesSkip();
      const first = await readSetupProgress();
      const completedAt = first?.completedAt;
      await setupService.recordSamplePagesSkip();
      const second = await readSetupProgress();
      expect(second?.samplePagesStatus).toBe('skipped');
      expect(second?.completedAt?.getTime()).toBe(completedAt?.getTime());
    });

    it('repeated terminal sample outcome keeps the summary step', async () => {
      await resetSetupOnboardingState();
      const { userId } = await createAdminUser();
      await db.insert(schema.setupProgress).values({
        id: 'default',
        adminUserId: userId,
        accountStatus: 'created',
        currentStep: 'sample_pages',
        aiStatus: 'skipped',
      });
      const results = [{ path: 'welcome', status: 'created' as const, pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a003' }];
      await setupService.recordSamplePagesOutcome('completed', results);
      await setupService.recordSamplePagesOutcome('completed', results);
      const progress = await readSetupProgress();
      expect(progress?.samplePagesStatus).toBe('completed');
      expect(progress?.currentStep).toBe('summary');
      expect(progress?.samplePagesResult).toEqual(results);
    });

    it('AI skip after a later manual reset returns to writing-mode selection', async () => {
      const progress = await readSetupProgress();
      expect(progress?.samplePagesStatus).toBe('completed');
      // Re-deciding AI after a manual reset must still collect the mode choice.
      await db
        .update(schema.setupProgress)
        .set({ aiStatus: 'not_started', currentStep: 'ai' })
        .where(eq(schema.setupProgress.id, 'default'));
      await setupService.recordAiSkip();
      const after = await readSetupProgress();
      expect(after?.currentStep).toBe('writing_mode');
    });
  });
});
