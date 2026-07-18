import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as rawEntries from '@/server/services/raw-entries';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as linkPages from '@/server/services/link-pages';
import { beginPendingSwitch, getSwitchState, setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';
import { runWritingModeSwitch } from './writing-mode-switch';

async function ensureWritingSpaces() {
  await db
    .insert(schema.spaces)
    .values([
      { slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false },
      { slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false },
    ])
    .onConflictDoNothing();
}

async function createPublishedGenerated(
  ctx: ReturnType<typeof buildUserCtx>,
  path: string,
  title: string,
) {
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

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('moves space rows in place, resolves paths deterministically, and materializes live links', async () => {
    const { userId } = await createAdminUser({ email: 'mode-switch-job@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    const raw = await rawEntries.createEntry(ctx, {
      path: 'inbox/payment-call', title: 'Payment call', inputKind: 'manual-note', content: 'Captured evidence.',
    });
    const generated = await createPublishedGenerated(ctx, 'concepts/payments', 'Payments');
    const unavailableTarget = await createPublishedGenerated(ctx, 'concepts/unavailable', 'Unavailable');
    const liveLink = await linkPages.createLinkPage(ctx, {
      path: 'docs/payments', title: 'Payments guide', targetPageId: generated.pageId,
    });
    const unavailableLink = await linkPages.createLinkPage(ctx, {
      path: 'docs/unavailable', title: 'Unavailable guide', targetPageId: unavailableTarget.pageId,
    });
    const originalGeneratedRevision = generated.versionId;

    // This destination is already occupied, so the moved generated page must
    // take the deterministic leaf suffix rather than collide or create a copy.
    await pageService.create(ctx, {
      path: 'generated/concepts/payments', title: 'Existing destination', contentSource: '# Existing',
    });
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: null })
      .where(eq(schema.pages.id, unavailableTarget.pageId));

    const jobId = '93b4f18e-2813-41c5-993a-aac54e4aaf25';
    await beginPendingSwitch('copilot', jobId, userId, {
      rawVisibility: 'public', generatedVisibility: 'restricted',
    });
    const report = await runWritingModeSwitch(jobId, {
      rawVisibility: 'public', generatedVisibility: 'restricted',
    });

    expect(report).toMatchObject({
      status: 'completed', movedPages: 3, materializedLinks: 1, deletedLinks: 1,
      conflicts: [{ pageId: generated.pageId, destinationPath: 'generated/concepts/payments-2' }],
    });
    const rawPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, raw.pageId) });
    const generatedPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, generated.pageId) });
    const originalRevision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, originalGeneratedRevision) });
    expect(rawPage).toMatchObject({ path: 'raw/inbox/payment-call', visibility: 'public' });
    expect(generatedPage).toMatchObject({ path: 'generated/concepts/payments-2', visibility: 'restricted' });
    expect(originalRevision?.pageId).toBe(generated.pageId);

    const materialized = await db.query.pages.findFirst({ where: eq(schema.pages.id, liveLink.pageId) });
    expect(materialized).toMatchObject({ kind: 'native', linkTargetPageId: null });
    const materializedRevision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, materialized!.currentPublishedVersionId!),
    });
    expect(materializedRevision).toMatchObject({
      actorKind: 'machine', linkTargetPageId: generated.pageId, status: 'published',
    });
    expect(materializedRevision?.contentSource).toContain('# Payments');

    const deleted = await db.query.pages.findFirst({ where: eq(schema.pages.id, unavailableLink.pageId) });
    expect(deleted?.deletedAt).not.toBeNull();
    await expect(getSwitchState()).resolves.toEqual({ mode: 'copilot', pendingMode: null, switchJobId: null });
  });
});
