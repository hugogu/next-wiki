import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as rawEntries from '@/server/services/raw-entries';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as linkPages from '@/server/services/link-pages';
import * as registry from '@/server/content-store/registry';
import * as replication from '@/server/services/storage-replication';
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

  afterEach(async () => {
    vi.restoreAllMocks();
    // The rollback case deliberately leaves a pending switch; clear the shared
    // singleton so it never leaks into another suite's write barrier.
    await db.delete(schema.writingModeSettings);
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

  it('stages the materialized link on an external store under the pre-generated id and kicks replication after commit', async () => {
    const { userId } = await createAdminUser({ email: 'mode-switch-external@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    const target = await createPublishedGenerated(ctx, 'concepts/external', 'External');
    const link = await linkPages.createLinkPage(ctx, {
      path: 'docs/external', title: 'External guide', targetPageId: target.pageId,
    });

    // An external active store stages the markdown object before the revision
    // row is visible; putMarkdown must use the same id the revision commits under.
    const staged = new Map<string, string>();
    const putMarkdown = vi.fn(async (id: string, source: string) => {
      staged.set(id, source);
    });
    vi.spyOn(registry, 'getActiveStore').mockResolvedValue({ type: 's3', putMarkdown } as never);
    const kick = vi.spyOn(replication, 'kickReplication').mockResolvedValue();

    const jobId = randomUUID();
    await beginPendingSwitch('copilot', jobId, userId, {
      rawVisibility: 'restricted', generatedVisibility: 'restricted',
    });
    const report = await runWritingModeSwitch(jobId, {
      rawVisibility: 'restricted', generatedVisibility: 'restricted',
    });

    expect(report).toMatchObject({ status: 'completed', materializedLinks: 1, deletedLinks: 0 });
    const materialized = await db.query.pages.findFirst({ where: eq(schema.pages.id, link.pageId) });
    expect(materialized).toMatchObject({ kind: 'native', linkTargetPageId: null });
    const revisionId = materialized!.currentPublishedVersionId!;
    expect(putMarkdown).toHaveBeenCalledTimes(1);
    expect(putMarkdown).toHaveBeenCalledWith(revisionId, expect.stringContaining('# External'));
    expect(staged.get(revisionId)).toContain('# External');
    // Replication only fires once the migration transaction has committed.
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('rolls back every row and leaves the staged external object orphaned when a write fails', async () => {
    const { userId } = await createAdminUser({ email: 'mode-switch-rollback@example.com' });
    const ctx = buildUserCtx(userId, 'admin');
    const raw = await rawEntries.createEntry(ctx, {
      path: 'inbox/evidence', title: 'Evidence', inputKind: 'manual-note', content: 'kept',
    });
    const target = await createPublishedGenerated(ctx, 'concepts/rollback', 'Rollback');
    const link = await linkPages.createLinkPage(ctx, {
      path: 'docs/rollback', title: 'Rollback guide', targetPageId: target.pageId,
    });

    const staged = new Map<string, string>();
    const putMarkdown = vi.fn(async (id: string, source: string) => {
      staged.set(id, source);
    });
    vi.spyOn(registry, 'getActiveStore').mockResolvedValue({ type: 's3', putMarkdown } as never);
    const kick = vi.spyOn(replication, 'kickReplication').mockResolvedValue();
    // Fails after the external object is staged and the revision row is inserted,
    // forcing the whole migration transaction to roll back.
    vi.spyOn(replication, 'addReplicationTasks').mockRejectedValueOnce(new Error('replication insert failed'));

    const jobId = randomUUID();
    await beginPendingSwitch('copilot', jobId, userId, {
      rawVisibility: 'public', generatedVisibility: 'restricted',
    });
    await expect(
      runWritingModeSwitch(jobId, { rawVisibility: 'public', generatedVisibility: 'restricted' }),
    ).rejects.toThrow(/replication insert failed/);

    // The external object was staged but no revision references it: an unreachable orphan.
    expect(putMarkdown).toHaveBeenCalledTimes(1);
    const orphanId = [...staged.keys()][0];
    expect(orphanId).toBeDefined();
    await expect(
      db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, orphanId!) }),
    ).resolves.toBeUndefined();

    // Every page stayed in its original space; nothing moved, no link materialized or deleted.
    const rawPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, raw.pageId) });
    const generatedPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, target.pageId) });
    const linkPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, link.pageId) });
    expect(rawPage).toMatchObject({ path: 'inbox/evidence' });
    expect(generatedPage).toMatchObject({ path: 'concepts/rollback' });
    expect(linkPage).toMatchObject({ kind: 'link', linkTargetPageId: target.pageId, deletedAt: null });

    // The pending marker survives so the terminal-failure handler can retry.
    await expect(getSwitchState()).resolves.toMatchObject({
      mode: 'llm-wiki', pendingMode: 'copilot', switchJobId: jobId,
    });
    // Replication is never kicked when the migration transaction rolls back.
    expect(kick).not.toHaveBeenCalled();
  });
});
