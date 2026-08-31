import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as linkPages from '@/server/services/link-pages';
import { resolveReaderPage } from '@/server/services/reader-routing';
import { setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

// 035 (T081): pg-boss is not running in tests (getBoss() returns null there),
// so enqueuePublicPageWarmup silently no-ops on the real path — mock it to
// observe which routes a move asks to be warmed.
const enqueuePublicPageWarmupMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/server/services/public-page-warmup', () => ({
  enqueuePublicPageWarmup: enqueuePublicPageWarmupMock,
}));

async function ensureSpaces() {
  await db
    .insert(schema.spaces)
    .values([
      { slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false },
      { slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false },
    ])
    .onConflictDoNothing();
}

async function publishedWikiPage(ctx: ReturnType<typeof buildUserCtx>, path: string, content: string) {
  const created = await pageService.create(ctx, { path, title: 'Doc', contentSource: content });
  await revisions.publish(ctx, { path, version: 1 });
  return created;
}

describe('pages.moveToSpace', () => {
  let adminCtx: ReturnType<typeof buildUserCtx>;
  let editorCtx: ReturnType<typeof buildUserCtx>;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureSpaces();
    await setModeInternal('llm-wiki', null);
    const { userId } = await createAdminUser({ email: 'move-admin@example.com' });
    adminCtx = buildUserCtx(userId, 'admin');
    const [editor] = await db
      .insert(schema.users)
      .values({ email: 'move-editor@example.com', passwordHash: 'HASH', role: 'editor', status: 'active' })
      .returning();
    editorCtx = buildUserCtx(editor!.id, 'editor');
    enqueuePublicPageWarmupMock.mockClear();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('moves a plain wiki page into generated, injecting OKF frontmatter as a new revision', async () => {
    const created = await publishedWikiPage(adminCtx, 'imported/ai-doc', 'This was actually AI-generated.');

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' });

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    const generated = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    expect(page).toMatchObject({ spaceId: generated!.id, nature: 'generated', visibility: 'restricted' });

    const rows = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));
    // A new published, machine-authored revision carries the OKF frontmatter.
    expect(rows).toHaveLength(2);
    expect(page!.currentPublishedVersionId).toBe(rows[1]!.id);
    expect(rows[1]).toMatchObject({ status: 'published', actorKind: 'machine' });
    expect(rows[1]!.contentSource).toMatch(/^---\ntype: /);
    expect(rows[1]!.contentSource).toContain('This was actually AI-generated.');
  });

  it('derives an OKF type from the path when imported frontmatter lacks one', async () => {
    // Wiki.js-style import: has frontmatter, but no `type`.
    const imported = '---\ntitle: Imported\nauthor: legacy\n---\n\n# Imported doc';
    const created = await publishedWikiPage(adminCtx, 'guides/setup/install', imported);

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' });

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    const rows = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));
    // The parent path becomes the type; the original keys and body are preserved.
    expect(rows[1]!.contentSource).toContain('type: guides/setup');
    expect(rows[1]!.contentSource).toContain('author: legacy');
    expect(rows[1]!.contentSource).toContain('# Imported doc');
    expect(page).toMatchObject({ nature: 'generated' });
  });

  it('moves an already-OKF-conformant page without adding a revision', async () => {
    const okf = '---\ntype: Concept\ntitle: Ready\n---\n\nAlready conformant.';
    const created = await publishedWikiPage(adminCtx, 'imported/ready', okf);

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' });

    const rows = await db.select().from(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, created.pageId));
    expect(rows).toHaveLength(1);
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    expect(page).toMatchObject({ nature: 'generated', visibility: 'restricted' });
  });

  it('moves a generated page back to the wiki as public without transforming content', async () => {
    const created = await pageService.create(adminCtx, { path: 'concepts/x', title: 'X', contentSource: '# X body' }, 'generated');
    await revisions.publish(adminCtx, { path: 'concepts/x', version: 1, space: 'generated' });

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'default' });

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    const wiki = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
    expect(page).toMatchObject({ spaceId: wiki!.id, visibility: 'public' });
    const rows = await db.select().from(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, created.pageId));
    expect(rows).toHaveLength(1);
  });

  it('honours an explicit visibility choice', async () => {
    const created = await publishedWikiPage(adminCtx, 'imported/keep-public', 'body');
    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated', visibility: 'public' });
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    expect(page?.visibility).toBe('public');
  });

  it('rejects moving into the raw space', async () => {
    const created = await publishedWikiPage(adminCtx, 'imported/no-raw', 'body');
    await expect(
      pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'raw' as never }),
    ).rejects.toMatchObject({ code: 'PAGE_SPACE_MOVE_INVALID' } satisfies Partial<DomainError>);
  });

  it('rejects a target-space path conflict', async () => {
    const created = await publishedWikiPage(adminCtx, 'concepts/dup', 'wiki body');
    await pageService.create(adminCtx, { path: 'concepts/dup', title: 'Existing', contentSource: '---\ntype: Note\n---\n\nx' }, 'generated');
    await expect(
      pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' }),
    ).rejects.toMatchObject({ code: 'PAGE_PATH_CONFLICT' } satisfies Partial<DomainError>);
  });

  it('rejects a target-space address collision even when the path itself is free (035 T081)', async () => {
    const created = await publishedWikiPage(adminCtx, 'concepts/address-move-source', 'wiki body');
    // A different path in the target space, but a colliding *address*.
    const holder = await pageService.create(
      adminCtx,
      { path: 'concepts/address-move-holder', slug: 'concepts/address-move-source', title: 'Holder', contentSource: '---\ntype: Note\n---\n\nx' },
      'generated',
    );
    await revisions.publish(adminCtx, { path: 'concepts/address-move-holder', version: 1, space: 'generated' });
    expect(holder).toBeTruthy();

    await expect(
      pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' }),
    ).rejects.toMatchObject({ code: 'PAGE_SLUG_TAKEN' } satisfies Partial<DomainError>);

    // Neither page moved or was otherwise altered by the rejected attempt.
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    const wiki = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
    expect(page?.spaceId).toBe(wiki!.id);
  });

  it('retains the page\'s pre-move address in the source space after a cross-space move (035 T081)', async () => {
    const created = await publishedWikiPage(adminCtx, 'concepts/address-move-retain', 'wiki body');

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' });

    const wiki = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
    const retained = await db.query.pageAddresses.findFirst({
      where: (t, { and: andOp, eq: eqOp }) => andOp(eqOp(t.spaceId, wiki!.id), eqOp(t.address, 'concepts/address-move-retain')),
    });
    expect(retained).toMatchObject({ pageId: created.pageId, kind: 'retained', reason: 'cross_space_migration' });
  });

  // Regression (035 FR-010): writing the `page_addresses` row is only half the
  // contract — a reader must still reach the page through it. The alias is
  // retained against the *source* space while the page itself has left, so
  // resolving it against the URL's own space found nothing and every moved
  // page 404'd at the address the move deliberately preserved.
  it('keeps a moved page reachable at its pre-move address, resolved against the destination space', async () => {
    const created = await publishedWikiPage(adminCtx, 'concepts/moved-reader', 'wiki body');

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated', visibility: 'public' });

    const generated = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    await expect(resolveReaderPage(buildAnonymousCtx(), ['generated', 'concepts', 'moved-reader']))
      .resolves.toMatchObject({ kind: 'original', legacy: false, page: { pageId: created.pageId } });

    // The pre-move wiki address resolves to the same page and carries the
    // *destination* space, so the route 301s there instead of back to itself.
    await expect(resolveReaderPage(buildAnonymousCtx(), ['wiki', 'concepts', 'moved-reader']))
      .resolves.toMatchObject({
        kind: 'original',
        legacy: true,
        sourcePath: 'concepts/moved-reader',
        page: { pageId: created.pageId },
        space: { id: generated!.id },
      });
  });

  it('never leaks a moved page the destination space does not let the reader see (035 FR-009)', async () => {
    const created = await publishedWikiPage(adminCtx, 'concepts/moved-restricted', 'wiki body');

    // No explicit visibility: moving into generated defaults to `restricted`.
    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' });

    // Exactly the surface a direct request for the destination address gives —
    // no redirect, and nothing disclosing where the page went.
    await expect(resolveReaderPage(buildAnonymousCtx(), ['generated', 'concepts', 'moved-restricted']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'restricted', legacy: false });
    await expect(resolveReaderPage(buildAnonymousCtx(), ['wiki', 'concepts', 'moved-restricted']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'restricted', legacy: true });
  });

  it('reclaims its own retained alias when a page moves back to the space it left', async () => {
    const created = await publishedWikiPage(adminCtx, 'concepts/round-trip', 'wiki body');
    const [wiki, generated] = await Promise.all([
      db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') }),
      db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') }),
    ]);

    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'generated' });
    // The alias the first move retained belongs to this very page, so the
    // move back is a reclaim, not an address collision.
    await pageService.moveToSpace(adminCtx, created.pageId, { targetSpace: 'default', visibility: 'public' });

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    expect(page).toMatchObject({ spaceId: wiki!.id, slug: 'concepts/round-trip' });

    // One alias, in the space just left — never a wiki-space row duplicating
    // the page's own canonical address.
    const aliases = await db.query.pageAddresses.findMany({ where: eq(schema.pageAddresses.pageId, created.pageId) });
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({ spaceId: generated!.id, address: 'concepts/round-trip', kind: 'retained' });

    await expect(resolveReaderPage(buildAnonymousCtx(), ['wiki', 'concepts', 'round-trip']))
      .resolves.toMatchObject({ kind: 'original', legacy: false, page: { pageId: created.pageId } });
    // The address the page was reachable at while it lived in generated now
    // redirects back to the wiki space.
    await expect(resolveReaderPage(buildAnonymousCtx(), ['generated', 'concepts', 'round-trip']))
      .resolves.toMatchObject({ kind: 'original', legacy: true, page: { pageId: created.pageId }, space: { id: wiki!.id } });
  });

  it('warms both the new address and the retained old-space address after moving a published page (035 T081)', async () => {
    await publishedWikiPage(adminCtx, 'concepts/address-move-warmup', 'wiki body');
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.path, 'concepts/address-move-warmup') });

    await pageService.moveToSpace(adminCtx, page!.id, { targetSpace: 'generated' });

    const warmedHrefs = enqueuePublicPageWarmupMock.mock.calls.map((call) => call[0]);
    expect(warmedHrefs).toContainEqual(expect.stringContaining('concepts/address-move-warmup'));
    // Two distinct routes: the new one (generated space) and the retained
    // old one (wiki space) — not just the new address alone.
    expect(new Set(warmedHrefs).size).toBeGreaterThanOrEqual(2);
  });

  it('rejects moving a generated page that is published through a wiki link', async () => {
    const target = await pageService.create(adminCtx, { path: 'concepts/linked', title: 'Linked', contentSource: '# Linked' }, 'generated');
    await revisions.publish(adminCtx, { path: 'concepts/linked', version: 1, space: 'generated' });
    await linkPages.createLinkPage(adminCtx, { path: 'docs/linked', title: 'Linked', targetPageId: target.pageId });
    await expect(
      pageService.moveToSpace(adminCtx, target.pageId, { targetSpace: 'default' }),
    ).rejects.toMatchObject({ code: 'PAGE_SPACE_MOVE_INVALID' } satisfies Partial<DomainError>);
  });

  it('rejects a link page and non-admin callers', async () => {
    const target = await pageService.create(adminCtx, { path: 'concepts/lt', title: 'LT', contentSource: '# LT' }, 'generated');
    await revisions.publish(adminCtx, { path: 'concepts/lt', version: 1, space: 'generated' });
    const link = await linkPages.createLinkPage(adminCtx, { path: 'docs/lt', title: 'LT', targetPageId: target.pageId });
    await expect(
      pageService.moveToSpace(adminCtx, link.pageId, { targetSpace: 'generated' }),
    ).rejects.toMatchObject({ code: 'PAGE_SPACE_MOVE_INVALID' } satisfies Partial<DomainError>);

    const created = await publishedWikiPage(adminCtx, 'imported/forbidden', 'body');
    await expect(
      pageService.moveToSpace(editorCtx, created.pageId, { targetSpace: 'generated' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<DomainError>);
  });
});
