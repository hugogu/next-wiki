import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { create, getHistory } from '@/server/services/pages';
import { publish } from '@/server/services/revisions';
import { resolveReaderPage } from '@/server/services/reader-routing';
import { setModeInternal } from '@/server/services/writing-mode';
import { confirmCrossSpaceMigration, listCrossSpaceMigrationItems, previewCrossSpaceMigration, runCrossSpaceMigration } from './cross-space-migrations';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

// 035 (T081): pg-boss is not running in tests (getBoss() returns null there),
// so enqueuePublicPageWarmup silently no-ops on the real path — mock it to
// observe which routes a migration asks to be warmed.
const enqueuePublicPageWarmupMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/server/services/public-page-warmup', () => ({
  enqueuePublicPageWarmup: enqueuePublicPageWarmupMock,
}));

/** The authorization boundary is intentionally covered without a database: a
 * real service invocation additionally validates source/destination visibility. */
describe('cross-space migration authorization contract', () => {
  it('requires read and edit scopes for an API key caller', async () => {
    const admin = buildUserCtx('admin-id', 'admin');
    const apiKey = buildApiKeyCtx('admin-id', 'admin', ['view', 'edit'], 'key-id');
    expect(admin.actor).toMatchObject({ kind: 'user', role: 'admin' });
    expect(apiKey.actor).toMatchObject({ kind: 'api_key', role: 'admin', scopes: ['view', 'edit'] });
    await expect(previewCrossSpaceMigration(buildApiKeyCtx('admin-id', 'admin', ['edit'], 'key-id'), {
      selection: { kind: 'page', pageId: '11111111-1111-4111-8111-111111111111' },
      destinationSpaceId: '22222222-2222-4222-8222-222222222222',
      adaptOkf: true,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('cross-space migration workflow', () => {
  let admin: ReturnType<typeof buildUserCtx>;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    await db.insert(schema.spaces).values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false }).onConflictDoNothing();
    await setModeInternal('llm-wiki', null);
    const account = await createAdminUser({ email: 'cross-space-admin@example.com' });
    admin = buildUserCtx(account.userId, 'admin');
    enqueuePublicPageWarmupMock.mockClear();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('previews, confirms, and moves a page while retaining its history', async () => {
    const page = await create(admin, { path: 'imports/ai-note', title: 'Imported AI note', contentSource: '# Note', visibility: 'restricted' });
    await publish(admin, { path: 'imports/ai-note', version: 1 });
    const generated = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    const preview = await previewCrossSpaceMigration(admin, {
      selection: { kind: 'page', pageId: page.pageId }, destinationSpaceId: generated!.id,
      adaptOkf: true,
    });
    expect(preview.items).toHaveLength(1);
    const operation = await confirmCrossSpaceMigration(admin, { previewId: preview.id, fingerprint: preview.fingerprint });
    await runCrossSpaceMigration(operation.id);

    const moved = await db.query.pages.findFirst({ where: eq(schema.pages.id, page.pageId) });
    expect(moved).toMatchObject({ spaceId: generated!.id, nature: 'generated', visibility: 'restricted', slug: 'imports/ai-note' });
    expect(await getHistory(admin, 'imports/ai-note', 'generated')).toHaveLength(2);
    const item = await db.query.crossSpaceMigrationItems.findFirst({ where: eq(schema.crossSpaceMigrationItems.migrationId, operation.id) });
    expect(item?.status).toBe('moved');
    // 035 (US2/FR-010): the page's pre-move address, keyed against the
    // *source* space, still resolves to it after the cross-space move.
    const wiki = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
    const retainedAddress = await db.query.pageAddresses.findFirst({
      where: and(eq(schema.pageAddresses.spaceId, wiki!.id), eq(schema.pageAddresses.address, 'imports/ai-note')),
    });
    expect(retainedAddress).toMatchObject({ pageId: page.pageId, kind: 'retained', reason: 'cross_space_migration' });
    // Writing the row is only half the contract — a reader must still reach
    // the page through it, resolved against the destination space the page
    // moved to (regression: this returned not_found for every moved page).
    await expect(resolveReaderPage(admin, ['wiki', 'imports', 'ai-note'])).resolves.toMatchObject({
      kind: 'original', legacy: true, page: { pageId: page.pageId }, space: { id: generated!.id },
    });
    // ...and read permission is re-checked on the destination page (FR-009):
    // the moved page is restricted, so an anonymous visitor sees no redirect.
    await expect(resolveReaderPage(buildAnonymousCtx(), ['wiki', 'imports', 'ai-note']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'restricted', legacy: true });
  });

  it('reclaims its own retained alias when a page is migrated back to the space it left', async () => {
    const page = await create(admin, { path: 'imports/round-trip', title: 'Round trip', contentSource: '# Note' });
    await publish(admin, { path: 'imports/round-trip', version: 1 });
    const [wiki, generated] = await Promise.all([
      db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') }),
      db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') }),
    ]);

    for (const destinationSpaceId of [generated!.id, wiki!.id]) {
      const preview = await previewCrossSpaceMigration(admin, {
        selection: { kind: 'page', pageId: page.pageId }, destinationSpaceId, adaptOkf: true, visibility: 'public',
      });
      const operation = await confirmCrossSpaceMigration(admin, { previewId: preview.id, fingerprint: preview.fingerprint });
      await runCrossSpaceMigration(operation.id);
    }

    expect(await db.query.pages.findFirst({ where: eq(schema.pages.id, page.pageId) })).toMatchObject({ spaceId: wiki!.id });
    // One alias, in the space just left — never a wiki-space row duplicating
    // the page's own canonical address again.
    const aliases = await db.query.pageAddresses.findMany({ where: eq(schema.pageAddresses.pageId, page.pageId) });
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({ spaceId: generated!.id, address: 'imports/round-trip', kind: 'retained' });

    await expect(resolveReaderPage(buildAnonymousCtx(), ['wiki', 'imports', 'round-trip']))
      .resolves.toMatchObject({ kind: 'original', legacy: false, page: { pageId: page.pageId } });
    await expect(resolveReaderPage(buildAnonymousCtx(), ['generated', 'imports', 'round-trip']))
      .resolves.toMatchObject({ kind: 'original', legacy: true, page: { pageId: page.pageId }, space: { id: wiki!.id } });
  });

  it('warms both the new address and the retained old-space address after moving a published page (035 T081)', async () => {
    const page = await create(admin, { path: 'imports/warmup-note', title: 'Warmup note', contentSource: '# Note' });
    await publish(admin, { path: 'imports/warmup-note', version: 1 });
    const generated = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    const preview = await previewCrossSpaceMigration(admin, {
      selection: { kind: 'page', pageId: page.pageId }, destinationSpaceId: generated!.id,
      adaptOkf: true,
    });
    const operation = await confirmCrossSpaceMigration(admin, { previewId: preview.id, fingerprint: preview.fingerprint });

    await runCrossSpaceMigration(operation.id);

    const warmedHrefs = enqueuePublicPageWarmupMock.mock.calls.map((call) => call[0]);
    // The new address, in the destination (generated) space.
    expect(warmedHrefs).toContainEqual(expect.stringContaining('imports/warmup-note'));
    // At least two distinct routes were warmed: the new one and the retained
    // old one in the source space — not just the new address alone.
    expect(new Set(warmedHrefs).size).toBeGreaterThanOrEqual(2);
  });

  it('rejects unresolved destination conflicts and paginates by a stable cursor order', async () => {
    const first = await create(admin, { path: 'imports/first', title: 'First', contentSource: '# First' });
    await create(admin, { path: 'imports/second', title: 'Second', contentSource: '# Second' });
    const generated = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    await create(admin, { path: 'target/first', title: 'Existing', contentSource: '# Existing' }, 'generated');
    const conflictPreview = await previewCrossSpaceMigration(admin, {
      selection: { kind: 'page', pageId: first.pageId }, destinationSpaceId: generated!.id, destinationPathPrefix: 'target', adaptOkf: true,
    });
    await expect(confirmCrossSpaceMigration(admin, { previewId: conflictPreview.id, fingerprint: conflictPreview.fingerprint })).rejects.toMatchObject({ code: 'MIGRATION_CONFLICT' });

    const preview = await previewCrossSpaceMigration(admin, {
      selection: { kind: 'folder', sourceSpaceId: (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') }))!.id, pathPrefix: 'imports' },
      destinationSpaceId: generated!.id, adaptOkf: true,
    });
    expect(preview.items).toHaveLength(2);
    const operation = await confirmCrossSpaceMigration(admin, { previewId: preview.id, fingerprint: preview.fingerprint });
    const firstPage = await listCrossSpaceMigrationItems(admin, operation.id, 1);
    const secondPage = await listCrossSpaceMigrationItems(admin, operation.id, 1, firstPage.nextCursor ?? undefined);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });
});
