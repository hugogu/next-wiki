import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as rawEntries from '@/server/services/raw-entries';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as replication from '@/server/services/storage-replication';
import { beginPendingSwitch, getSwitchState, setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';
import { runWritingModeSwitch } from './writing-mode-switch';

async function ensureWritingSpaces() {
  await db.insert(schema.spaces).values([
    { slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false },
    { slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false },
  ]).onConflictDoNothing();
  await db.insert(schema.rawCategories).values({ name: 'General', slug: 'general', isDefault: true }).onConflictDoNothing();
}

async function createPublishedGenerated(ctx: ReturnType<typeof buildUserCtx>, path: string, title: string) {
  const created = await pageService.create(ctx, { path, title, contentSource: `# ${title}` }, 'generated');
  await revisions.publish(ctx, { path, version: 1, space: 'generated' });
  return created;
}

describe('writing-mode switch job', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureWritingSpaces();
    await setModeInternal('llm-wiki', null);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(schema.writingModeSettings);
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('moves raw/generated rows in place and retires historical links', async () => {
    const { userId } = await createAdminUser({ email: 'mode-switch-job@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    const raw = await rawEntries.createEntry(ctx, { path: 'inbox/payment-call', title: 'Payment call', inputKind: 'manual-note', content: 'Captured evidence.' });
    const generated = await createPublishedGenerated(ctx, 'concepts/payments', 'Payments');
    const defaultSpace = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
    expect(defaultSpace).toBeDefined();
    const historicalLinkId = randomUUID();
    await db.insert(schema.pages).values({
      id: historicalLinkId,
      spaceId: defaultSpace!.id,
      path: 'docs/payments',
      slug: 'payments',
      locale: 'en',
      title: 'Payments guide',
      authorId: userId,
      kind: 'link',
      linkTargetPageId: generated.pageId,
      nature: 'generated',
    });
    await pageService.create(ctx, { path: 'generated/concepts/payments', title: 'Existing destination', contentSource: '# Existing' });

    const jobId = randomUUID();
    await beginPendingSwitch('copilot', jobId, userId, { rawVisibility: 'public', generatedVisibility: 'restricted' });
    const report = await runWritingModeSwitch(jobId, { rawVisibility: 'public', generatedVisibility: 'restricted' });

    expect(report).toMatchObject({
      status: 'completed', movedPages: 2, materializedLinks: 0, deletedLinks: 1,
      conflicts: [{ pageId: generated.pageId, destinationPath: 'generated/concepts/payments-2' }],
    });
    await expect(db.query.pages.findFirst({ where: eq(schema.pages.id, raw.pageId) })).resolves.toMatchObject({ path: 'raw/inbox/payment-call', visibility: 'public' });
    await expect(db.query.pages.findFirst({ where: eq(schema.pages.id, generated.pageId) })).resolves.toMatchObject({ path: 'generated/concepts/payments-2', visibility: 'restricted' });
    await expect(db.query.pages.findFirst({ where: eq(schema.pages.id, historicalLinkId) })).resolves.toMatchObject({ deletedAt: expect.any(Date) });
    await expect(db.query.retiredLinkPages.findFirst({ where: eq(schema.retiredLinkPages.linkPageId, historicalLinkId) })).resolves.toMatchObject({ targetPageId: generated.pageId });
    await expect(getSwitchState()).resolves.toEqual({ mode: 'copilot', pendingMode: null, switchJobId: null });
  });

  it('kicks replication only after a successful transaction', async () => {
    const { userId } = await createAdminUser({ email: 'mode-switch-replication@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    await createPublishedGenerated(ctx, 'concepts/replication', 'Replication');
    const kick = vi.spyOn(replication, 'kickReplication').mockResolvedValue();
    const jobId = randomUUID();
    await beginPendingSwitch('copilot', jobId, userId, { rawVisibility: 'restricted', generatedVisibility: 'restricted' });
    await expect(runWritingModeSwitch(jobId, { rawVisibility: 'restricted', generatedVisibility: 'restricted' })).resolves.toMatchObject({ status: 'completed' });
    expect(kick).toHaveBeenCalledTimes(1);
  });
});
