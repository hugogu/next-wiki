import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, isNull, max, sql } from 'drizzle-orm';
import { pathSchema } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, pagePermissionOptions, spacePermissionOptions, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { renderMarkdown } from '@/server/pipeline';
import { persistRevisionMetadata } from '@/server/services/page-metadata';
import { assertNotMigrating } from '@/server/services/migration';
import { enqueueGitExport } from '@/server/services/git-export';
import { invalidatePublicContentCache, invalidatePublicLinkPaths } from '@/server/cache/public-cache';
import { getSpaceById, resolveSpace } from '@/server/services/spaces';
import { assertNoSwitchInProgress, assertSpaceKindAllowed } from '@/server/services/writing-mode';

function actorKindOf(ctx: PermCtx): 'human' | 'machine' {
  return ctx.actor.kind === 'api_key' ? 'machine' : 'human';
}

function leafSlug(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function requireUser(ctx: PermCtx): string {
  const userId = getActorUserId(ctx);
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to manage link pages');
  return userId;
}

async function getLiveGeneratedTarget(targetPageId: string) {
  const target = await db.query.pages.findFirst({
    where: and(eq(schema.pages.id, targetPageId), isNull(schema.pages.deletedAt)),
  });
  if (!target || target.kind !== 'native' || !target.currentPublishedVersionId) {
    throw new DomainError('LINK_TARGET_INVALID', 'Link targets must be live native generated pages');
  }
  const targetSpace = await getSpaceById(target.spaceId);
  if (!targetSpace || targetSpace.kind !== 'generated') {
    throw new DomainError('LINK_TARGET_INVALID', 'Link targets must be in the generated space');
  }
  await assertSpaceKindAllowed(targetSpace.kind);
  return target;
}

function assertLinkWrite(ctx: PermCtx, action: 'create' | 'edit' | 'delete', space: Awaited<ReturnType<typeof resolveSpace>>, page?: typeof schema.pages.$inferSelect): void {
  if (!space || space.kind !== 'wiki') {
    throw new DomainError('LINK_TARGET_INVALID', 'Link pages must be created in the wiki space');
  }
  if (ctx.actor.kind === 'anonymous' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Only Admins can manage link pages');
  }
  const options = page
    ? pagePermissionOptions(space, page, { isAuthor: page.authorId === getActorUserId(ctx) })
    : spacePermissionOptions(space);
  const resource = page ? { kind: 'page' as const, pageId: page.id } : { kind: 'page_list' as const };
  if (!can(ctx, action, resource, options)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage link pages');
  }
}

export async function createLinkPage(
  ctx: PermCtx,
  input: { path: string; title?: string; targetPageId: string },
): Promise<{ pageId: string; versionId: string }> {
  const userId = requireUser(ctx);
  const parsedPath = pathSchema.safeParse(input.path);
  if (!parsedPath.success) throw new DomainError('BAD_REQUEST', parsedPath.error.issues[0]?.message ?? 'Invalid path');
  const space = await resolveSpace();
  await assertSpaceKindAllowed(space?.kind ?? 'wiki');
  assertLinkWrite(ctx, 'create', space);
  const target = await getLiveGeneratedTarget(input.targetPageId);
  await assertNotMigrating();
  const revisionId = randomUUID();
  const title = input.title ?? target.title;

  const created = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    const existing = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space!.id),
        eq(schema.pages.path, parsedPath.data),
        isNull(schema.pages.translationGroupId),
      ),
    });
    if (existing) throw new DomainError('CONFLICT', 'A page with this path already exists');

    const { html, hash } = renderMarkdown('');
    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: space!.id,
        slug: leafSlug(parsedPath.data),
        path: parsedPath.data,
        title,
        authorId: userId,
        kind: 'link',
        linkTargetPageId: target.id,
        nature: 'generated',
        visibility: 'public',
      })
      .returning();
    if (!page) throw new Error('Failed to create link page');

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource: null,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'published',
        actorKind: actorKindOf(ctx),
        linkTargetPageId: target.id,
        publishedAt: new Date(),
      })
      .returning();
    if (!revision) throw new Error('Failed to create link revision');
    await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: space!.id, source: '', fallbackTitle: title });
    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id, currentPublishedVersionId: revision.id, updatedAt: new Date() })
      .where(eq(schema.pages.id, page.id));
    return { pageId: page.id, versionId: revision.id };
  });
  invalidatePublicContentCache();
  invalidatePublicLinkPaths([parsedPath.data]);
  await enqueueGitExport('publish');
  return created;
}

export async function retargetLinkPage(
  ctx: PermCtx,
  pageId: string,
  targetPageId: string,
  options: { expectedRevisionId?: string } = {},
): Promise<{ versionId: string }> {
  const userId = requireUser(ctx);
  const page = await db.query.pages.findFirst({ where: and(eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt)) });
  if (!page || page.kind !== 'link') throw new DomainError('NOT_FOUND', 'Link page not found');
  const space = await getSpaceById(page.spaceId);
  await assertSpaceKindAllowed(space?.kind ?? 'wiki');
  assertLinkWrite(ctx, 'edit', space, page);
  const target = await getLiveGeneratedTarget(targetPageId);
  await assertNotMigrating();
  const revisionId = randomUUID();

  const retargeted = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    await tx.execute(sql`select id from pages where id = ${page.id} for update`);
    const currentPage = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.id, page.id), isNull(schema.pages.deletedAt)),
    });
    if (!currentPage || currentPage.kind !== 'link') throw new DomainError('NOT_FOUND', 'Link page not found');
    if (options.expectedRevisionId && currentPage.latestVersionId !== options.expectedRevisionId) {
      throw new DomainError('STALE_REVISION', 'The page has changed since the supplied base revision');
    }
    const versionRows = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, page.id));
    const { html, hash } = renderMarkdown('');
    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: currentPage.id,
        versionNumber: (versionRows[0]?.value ?? 0) + 1,
        contentType: 'text/markdown',
        contentSource: null,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'published',
        actorKind: actorKindOf(ctx),
        linkTargetPageId: target.id,
        publishedAt: new Date(),
      })
      .returning();
    if (!revision) throw new Error('Failed to retarget link page');
    await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: space!.id, source: '', fallbackTitle: currentPage.title });
    await tx
      .update(schema.pages)
      .set({
        linkTargetPageId: target.id,
        latestVersionId: revision.id,
        currentPublishedVersionId: revision.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, currentPage.id));
    return { versionId: revision.id };
  });
  invalidatePublicContentCache();
  invalidatePublicLinkPaths([page.path]);
  await enqueueGitExport('publish');
  return retargeted;
}

export async function deleteLinkPage(ctx: PermCtx, pageId: string): Promise<void> {
  requireUser(ctx);
  const page = await db.query.pages.findFirst({ where: and(eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt)) });
  if (!page || page.kind !== 'link') throw new DomainError('NOT_FOUND', 'Link page not found');
  const space = await getSpaceById(page.spaceId);
  await assertSpaceKindAllowed(space?.kind ?? 'wiki');
  assertLinkWrite(ctx, 'delete', space, page);
  await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    await tx.update(schema.pages).set({ deletedAt: new Date() }).where(eq(schema.pages.id, page.id));
  });
  invalidatePublicContentCache();
  invalidatePublicLinkPaths([page.path]);
  await enqueueGitExport('publish');
}

/** Return public wiki paths currently pointing at a generated page. */
export async function listLiveLinksForTarget(targetPageId: string): Promise<string[]> {
  const rows = await db
    .select({ path: schema.pages.path })
    .from(schema.pages)
    .where(and(
      eq(schema.pages.kind, 'link'),
      eq(schema.pages.linkTargetPageId, targetPageId),
      isNull(schema.pages.deletedAt),
      isNotNull(schema.pages.currentPublishedVersionId),
    ));
  return rows.map((row) => row.path);
}
