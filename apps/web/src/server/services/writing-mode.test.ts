import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { buildUserCtx } from '@/server/permissions';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';
import { create as createPage } from './pages';

const jobs = vi.hoisted(() => ({ enqueue: vi.fn(), getBoss: vi.fn() }));

vi.mock('@/server/jobs/runtime', () => ({
  QUEUES: { writingModeSwitch: 'writing-mode-switch' },
  enqueue: jobs.enqueue,
  getBoss: jobs.getBoss,
}));

import {
  assertNoSwitchInProgress,
  assertSpaceKindAllowed,
  beginPendingSwitch,
  clearPendingSwitch,
  getMode,
  getSwitchState,
  isLlmWikiMode,
  setMode,
  setModeInternal,
  switchMode,
} from './writing-mode';

describe('writing-mode service', () => {
  beforeAll(async () => {
    await resetSetupOnboardingState();
  });

  beforeEach(async () => {
    jobs.enqueue.mockResolvedValue('queued-job');
    jobs.getBoss.mockReturnValue(null);
    await db.delete(schema.writingModeSettings);
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('getMode seeds the singleton row with copilot when absent', async () => {
    await expect(getMode()).resolves.toBe('copilot');
    const row = await db.query.writingModeSettings.findFirst();
    expect(row?.mode).toBe('copilot');
  });

  it('setModeInternal flips the mode and getMode observes it', async () => {
    await expect(getMode()).resolves.toBe('copilot');
    await setModeInternal('llm-wiki', null);
    await expect(getMode()).resolves.toBe('llm-wiki');
    await expect(isLlmWikiMode()).resolves.toBe(true);
    await setModeInternal('copilot', null);
    await expect(isLlmWikiMode()).resolves.toBe(false);
  });

  it('setMode requires an admin session actor', async () => {
    const { userId } = await createAdminUser();
    await expect(setMode(buildUserCtx(userId, 'editor'), 'llm-wiki')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<DomainError>);
    await expect(setMode(buildUserCtx(userId, 'admin'), 'llm-wiki')).resolves.toBe('llm-wiki');
    await expect(getMode()).resolves.toBe('llm-wiki');
  });

  it('assertSpaceKindAllowed rejects raw/generated in copilot mode', async () => {
    await expect(getMode()).resolves.toBe('copilot');
    await expect(assertSpaceKindAllowed('wiki')).resolves.toBeUndefined();
    await expect(assertSpaceKindAllowed('raw')).rejects.toMatchObject({
      code: 'SPACE_UNAVAILABLE',
    } satisfies Partial<DomainError>);
    await expect(assertSpaceKindAllowed('generated')).rejects.toMatchObject({
      code: 'SPACE_UNAVAILABLE',
    } satisfies Partial<DomainError>);
  });

  it('assertSpaceKindAllowed allows every space kind in llm-wiki mode', async () => {
    await setModeInternal('llm-wiki', null);
    await expect(assertSpaceKindAllowed('wiki')).resolves.toBeUndefined();
    await expect(assertSpaceKindAllowed('raw')).resolves.toBeUndefined();
    await expect(assertSpaceKindAllowed('generated')).resolves.toBeUndefined();
  });

  it('beginPendingSwitch/clearPendingSwitch maintain the paired-null switch state', async () => {
    const { userId } = await createAdminUser({ email: 'switch-state-admin@example.com' });
    const jobId = randomUUID();

    await beginPendingSwitch('llm-wiki', jobId, userId);
    const pending = await getSwitchState();
    expect(pending.mode).toBe('copilot');
    expect(pending.pendingMode).toBe('llm-wiki');
    expect(pending.switchJobId).toBe(jobId);
    // The committed mode is untouched while the switch is pending.
    await expect(getMode()).resolves.toBe('copilot');

    await clearPendingSwitch(userId);
    const cleared = await getSwitchState();
    expect(cleared.mode).toBe('copilot');
    expect(cleared.pendingMode).toBeNull();
    expect(cleared.switchJobId).toBeNull();
  });

  it('assertNoSwitchInProgress passes with no pending switch and throws once one is set', async () => {
    await expect(
      db.transaction(async (tx) => {
        await assertNoSwitchInProgress(tx);
      }),
    ).resolves.toBeUndefined();

    const { userId } = await createAdminUser({ email: 'barrier-admin@example.com' });
    await beginPendingSwitch('llm-wiki', randomUUID(), userId);

    await expect(
      db.transaction(async (tx) => {
        await assertNoSwitchInProgress(tx);
      }),
    ).rejects.toMatchObject({
      code: 'MODE_SWITCH_IN_PROGRESS',
    } satisfies Partial<DomainError>);

    await clearPendingSwitch(userId);
    await expect(
      db.transaction(async (tx) => {
        await assertNoSwitchInProgress(tx);
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a content write while a mode switch is pending', async () => {
    const { userId } = await createAdminUser({ email: 'write-barrier-admin@example.com' });
    const ctx = buildUserCtx(userId, 'admin');

    await beginPendingSwitch('llm-wiki', randomUUID(), userId);
    await expect(
      createPage(ctx, { path: 'switch-blocked-page', title: 'Blocked', contentSource: '# Hi' }),
    ).rejects.toMatchObject({
      code: 'MODE_SWITCH_IN_PROGRESS',
    } satisfies Partial<DomainError>);

    await clearPendingSwitch(userId);
    await expect(
      createPage(ctx, { path: 'switch-blocked-page', title: 'Blocked', contentSource: '# Hi' }),
    ).resolves.toMatchObject({ pageId: expect.any(String), versionId: expect.any(String) });
  });

  it('switches forward synchronously and queues the reverse migration with durable options', async () => {
    const { userId } = await createAdminUser({ email: 'mode-transition-admin@example.com' });
    const ctx = buildUserCtx(userId, 'admin');

    await expect(switchMode(ctx, 'llm-wiki')).resolves.toEqual({ status: 'updated', mode: 'llm-wiki' });
    await expect(getMode()).resolves.toBe('llm-wiki');

    const queued = await switchMode(ctx, 'copilot', {
      rawVisibility: 'public',
      generatedVisibility: 'restricted',
    });
    expect(queued).toMatchObject({ status: 'pending', jobId: expect.any(String) });
    expect(jobs.enqueue).toHaveBeenCalledWith(
      'writing-mode-switch',
      { rawVisibility: 'public', generatedVisibility: 'restricted' },
      { id: (queued as { jobId: string }).jobId },
    );
    const settings = await db.query.writingModeSettings.findFirst();
    expect(settings).toMatchObject({
      mode: 'llm-wiki',
      pendingMode: 'copilot',
      switchJobId: (queued as { jobId: string }).jobId,
      switchOptions: { rawVisibility: 'public', generatedVisibility: 'restricted' },
    });
  });

  it('returns the same pending job for duplicate requests and rejects conflicting transitions', async () => {
    const { userId } = await createAdminUser({ email: 'duplicate-mode-transition-admin@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    await setModeInternal('llm-wiki', userId);

    const first = await switchMode(ctx, 'copilot', {
      rawVisibility: 'public',
      generatedVisibility: 'public',
    });
    const duplicate = await switchMode(ctx, 'copilot', {
      rawVisibility: 'restricted',
      generatedVisibility: 'restricted',
    });
    expect(duplicate).toEqual(first);
    await expect(switchMode(ctx, 'llm-wiki')).rejects.toMatchObject({
      code: 'MODE_SWITCH_IN_PROGRESS',
    } satisfies Partial<DomainError>);
  });

  it('requires reverse visibility choices and clears a marker when immediate enqueue fails', async () => {
    const { userId } = await createAdminUser({ email: 'mode-enqueue-admin@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    await setModeInternal('llm-wiki', userId);

    await expect(switchMode(ctx, 'copilot')).rejects.toMatchObject({
      code: 'MODE_SWITCH_INVALID',
    } satisfies Partial<DomainError>);

    jobs.enqueue.mockResolvedValueOnce(null);
    await expect(switchMode(ctx, 'copilot', {
      rawVisibility: 'public',
      generatedVisibility: 'restricted',
    })).rejects.toMatchObject({ code: 'JOB_QUEUE_UNAVAILABLE' } satisfies Partial<DomainError>);
    await expect(getSwitchState()).resolves.toMatchObject({
      mode: 'llm-wiki', pendingMode: null, switchJobId: null,
    });
  });
});
