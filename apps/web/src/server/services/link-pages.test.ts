import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import * as linkPages from '@/server/services/link-pages';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
import * as revisions from '@/server/services/revisions';
import { setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

async function ensureGeneratedSpace() {
  await db
    .insert(schema.spaces)
    .values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false })
    .onConflictDoNothing();
}

async function createPublishedGeneratedPage(ctx: ReturnType<typeof buildUserCtx>, path: string, title: string, content: string) {
  const created = await pageService.create(ctx, { path, title, contentSource: content }, 'generated');
  await revisions.publish(ctx, { path, version: 1, space: 'generated' });
  return created;
}

describe('link pages', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureGeneratedSpace();
    await setModeInternal('llm-wiki', null);
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('creates a published wiki link with immutable generated target history', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const target = await createPublishedGeneratedPage(ctx, 'concepts/payments', 'Payments', '# Payments');

    const link = await linkPages.createLinkPage(ctx, {
      path: 'docs/payments', title: 'Payments guide', targetPageId: target.pageId,
    });
    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, link.pageId) });
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, link.versionId) });

    expect(page).toMatchObject({
      kind: 'link', linkTargetPageId: target.pageId, nature: 'generated', visibility: 'public',
      currentPublishedVersionId: link.versionId,
    });
    expect(revision).toMatchObject({
      contentSource: null, status: 'published', linkTargetPageId: target.pageId,
    });
  });

  it('rejects unpublished, non-generated, and link-chain targets', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const draftGenerated = await pageService.create(ctx, {
      path: 'concepts/draft', title: 'Draft', contentSource: '# Draft',
    }, 'generated');
    const wiki = await pageService.create(ctx, {
      path: 'docs/native', title: 'Native', contentSource: '# Native',
    });
    await revisions.publish(ctx, { path: 'docs/native', version: 1 });
    const target = await createPublishedGeneratedPage(ctx, 'concepts/live', 'Live', '# Live');
    const link = await linkPages.createLinkPage(ctx, { path: 'docs/live', targetPageId: target.pageId });

    await expect(linkPages.createLinkPage(ctx, {
      path: 'docs/draft', targetPageId: draftGenerated.pageId,
    })).rejects.toMatchObject({ code: 'LINK_TARGET_INVALID' });
    await expect(linkPages.createLinkPage(ctx, {
      path: 'docs/native-link', targetPageId: wiki.pageId,
    })).rejects.toMatchObject({ code: 'LINK_TARGET_INVALID' });
    await expect(linkPages.createLinkPage(ctx, {
      path: 'docs/link-chain', targetPageId: link.pageId,
    })).rejects.toMatchObject({ code: 'LINK_TARGET_INVALID' });

    const [editor] = await db
      .insert(schema.users)
      .values({ email: 'link-editor@example.com', passwordHash: 'HASH', role: 'editor', status: 'active' })
      .returning();
    await expect(linkPages.createLinkPage(buildUserCtx(editor!.id, 'editor'), {
      path: 'docs/editor-link', targetPageId: target.pageId,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(pageService.updateProperties(buildUserCtx(editor!.id, 'editor'), 'docs/live', {
      title: 'Editor rename',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('retargets through a new published revision and deletes only the link', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const firstTarget = await createPublishedGeneratedPage(ctx, 'concepts/first', 'First', '# First');
    const secondTarget = await createPublishedGeneratedPage(ctx, 'concepts/second', 'Second', '# Second');
    const link = await linkPages.createLinkPage(ctx, { path: 'docs/concept', targetPageId: firstTarget.pageId });

    const retargeted = await linkPages.retargetLinkPage(ctx, link.pageId, secondTarget.pageId);
    const history = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, link.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));
    expect(history.map((revision) => revision.linkTargetPageId)).toEqual([firstTarget.pageId, secondTarget.pageId]);
    expect(history[1]?.id).toBe(retargeted.versionId);
    await expect(linkPages.retargetLinkPage(ctx, link.pageId, firstTarget.pageId, {
      expectedRevisionId: link.versionId,
    })).rejects.toMatchObject({ code: 'STALE_REVISION' });

    await linkPages.deleteLinkPage(ctx, link.pageId);
    const deletedLink = await db.query.pages.findFirst({ where: eq(schema.pages.id, link.pageId) });
    const intactTarget = await db.query.pages.findFirst({ where: eq(schema.pages.id, secondTarget.pageId) });
    expect(deletedLink?.deletedAt).not.toBeNull();
    expect(intactTarget?.deletedAt).toBeNull();
  });

  it('retargets links through the public-content property update', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const firstTarget = await createPublishedGeneratedPage(ctx, 'concepts/public-first', 'First', '# First');
    const secondTarget = await createPublishedGeneratedPage(ctx, 'concepts/public-second', 'Second', '# Second');
    const link = await linkPages.createLinkPage(ctx, { path: 'docs/public-link', targetPageId: firstTarget.pageId });

    const updated = await publicContent.updateProperties(ctx, link.pageId, {
      linkTargetPageId: secondTarget.pageId,
      baseRevisionId: link.versionId,
    }, ['latestRevision']);

    expect(updated.linkTarget).toEqual({ pageId: secondTarget.pageId, path: 'concepts/public-second', title: 'Second' });
    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, updated.latestRevision!.id),
    });
    expect(revision?.linkTargetPageId).toBe(secondTarget.pageId);
  });

  it('renders the target revision at the link path and returns not found when it is unavailable', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const target = await createPublishedGeneratedPage(ctx, 'concepts/runtime', 'Runtime', '# Runtime');
    await linkPages.createLinkPage(ctx, { path: 'docs/runtime', title: 'Runtime guide', targetPageId: target.pageId });

    const live = await pageService.getLive(buildAnonymousCtx(), 'docs/runtime');
    expect(live).toMatchObject({ path: 'docs/runtime', title: 'Runtime guide' });
    expect(live?.contentHtml).toContain('Runtime');

    const draft = await pageService.newDraft(ctx, 'concepts/runtime', {
      title: 'Runtime', contentSource: '# Updated runtime', baseRevisionId: target.versionId,
    }, 'generated');
    await revisions.publish(ctx, { path: 'concepts/runtime', version: draft.versionNumber, space: 'generated' });
    await expect(pageService.getLive(buildAnonymousCtx(), 'docs/runtime')).resolves.toMatchObject({
      path: 'docs/runtime', contentHtml: expect.stringContaining('Updated runtime'),
    });

    await db.update(schema.pages).set({ currentPublishedVersionId: null }).where(eq(schema.pages.id, target.pageId));
    await expect(pageService.getLive(buildAnonymousCtx(), 'docs/runtime')).resolves.toBeNull();
  });

  it('projects link targets only to Admin page and tree resources', async () => {
    const { userId } = await createAdminUser();
    const adminCtx = buildUserCtx(userId, 'admin');
    const target = await createPublishedGeneratedPage(adminCtx, 'concepts/private', 'Private', '# Private');
    const link = await linkPages.createLinkPage(adminCtx, { path: 'docs/private', targetPageId: target.pageId });

    const anonymous = await publicContent.getPageById(buildAnonymousCtx(), link.pageId);
    const admin = await publicContent.getPageById(adminCtx, link.pageId);
    const anonymousTree = await publicContent.getPageTree(buildAnonymousCtx(), { status: 'published' });
    const adminTree = await publicContent.getPageTree(adminCtx, { status: 'published' });
    const anonymousLeaf = anonymousTree.root.children.find((node) => node.segment === 'docs')?.children[0];
    const adminLeaf = adminTree.root.children.find((node) => node.segment === 'docs')?.children[0];

    expect(anonymous).toMatchObject({ kind: 'link', linkTarget: undefined });
    expect(admin?.linkTarget).toEqual({ pageId: target.pageId, path: 'concepts/private', title: 'Private' });
    expect(anonymousLeaf).toMatchObject({ kind: 'link', linkTarget: null });
    expect(adminLeaf?.linkTarget).toEqual({ pageId: target.pageId, path: 'concepts/private', title: 'Private' });

    const sitemapPages = await pageService.listPublished(buildAnonymousCtx());
    const sitemapLink = sitemapPages.find((page) => page.path === 'docs/private');
    expect(sitemapLink).toMatchObject({ path: 'docs/private' });
    expect(JSON.stringify(sitemapLink)).not.toContain(target.pageId);
    expect(JSON.stringify(sitemapLink)).not.toContain('concepts/private');
  });
});
