import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as linkPages from '@/server/services/link-pages';
import { setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

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
