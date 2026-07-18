import { randomUUID } from 'node:crypto';
import { and, eq, isNull, max, sql } from 'drizzle-orm';
import { stringify as stringifyYaml } from 'yaml';
import { pathSchema, rawInputKindSchema, rawSourceSchema, type RawInputKind, type RawSource } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, pagePermissionOptions, spacePermissionOptions, type PermCtx } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { DomainError } from '@/server/errors';
import { metadataFromSource, persistRevisionMetadata } from '@/server/services/page-metadata';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { assertNotMigrating } from '@/server/services/migration';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { actorKindOf } from '@/server/services/pages';
import { resolveSpace } from '@/server/services/spaces';
import { assertNoSwitchInProgress, assertSpaceKindAllowed } from '@/server/services/writing-mode';

const RAW_APPEND_SEPARATOR = '\n\n---\n\n';

function leafSlug(path: string): string {
  return path.split('/').pop() ?? path;
}

function assertRawWriteAccess(ctx: PermCtx, space: { kind: 'raw'; anonymousRead: boolean }): string {
  const userId = getActorUserId(ctx);
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to create raw entries');
  if (!can(ctx, 'create', { kind: 'page_list' }, spacePermissionOptions(space))) {
    throw new DomainError('SPACE_FORBIDDEN', 'You do not have permission to write raw entries');
  }
  return userId;
}

function rawSource(input: { title: string; inputKind: RawInputKind; source?: RawSource; content: string }): string {
  const frontmatter = {
    type: input.inputKind,
    title: input.title,
    timestamp: new Date().toISOString(),
    ...input.source,
  };
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${input.content}`;
}

async function rawSpace() {
  await assertSpaceKindAllowed('raw');
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') throw new DomainError('NOT_FOUND', 'Raw space not found');
  return { ...space, kind: 'raw' as const };
}

export async function createEntry(
  ctx: PermCtx,
  input: { path: string; title: string; inputKind: unknown; source?: unknown; content: string },
): Promise<{ pageId: string; versionId: string }> {
  const parsedPath = pathSchema.safeParse(input.path);
  if (!parsedPath.success) throw new DomainError('BAD_REQUEST', parsedPath.error.issues[0]?.message ?? 'Invalid path');
  const parsedKind = rawInputKindSchema.safeParse(input.inputKind);
  if (!parsedKind.success) throw new DomainError('BAD_REQUEST', 'Raw entries require a valid input kind');
  const parsedSource = input.source === undefined ? undefined : rawSourceSchema.safeParse(input.source);
  if (parsedSource && !parsedSource.success) throw new DomainError('BAD_REQUEST', 'Raw entry source metadata is invalid');
  if (!input.content.trim()) throw new DomainError('BAD_REQUEST', 'Raw entry content is required');

  const space = await rawSpace();
  const userId = assertRawWriteAccess(ctx, space);
  await assertNotMigrating();

  const contentSource = rawSource({
    title: input.title,
    inputKind: parsedKind.data,
    source: parsedSource?.data,
    content: input.content,
  });
  const revisionId = randomUUID();
  const metadata = metadataFromSource(contentSource, input.title);

  const created = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    const existing = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, parsedPath.data), isNull(schema.pages.translationGroupId)),
    });
    if (existing) throw new DomainError('CONFLICT', 'A page with this path already exists');

    const { html, hash } = renderMarkdown(contentSource);
    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: space.id,
        slug: leafSlug(parsedPath.data),
        path: parsedPath.data,
        title: metadata.title,
        authorId: userId,
        nature: 'original',
        visibility: 'restricted',
      })
      .returning();
    if (!page) throw new Error('Failed to create raw entry');

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'published',
        actorKind: actorKindOf(ctx),
        sourceMetadata: parsedSource?.data ?? null,
        publishedAt: new Date(),
      })
      .returning();
    if (!revision) throw new Error('Failed to create raw revision');
    await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: space.id, source: contentSource, fallbackTitle: metadata.title });
    await syncRevisionAssetRefs(tx, revision.id, contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);
    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id, currentPublishedVersionId: revision.id, updatedAt: new Date() })
      .where(eq(schema.pages.id, page.id));
    return { pageId: page.id, versionId: revision.id };
  });

  await kickReplication();
  return created;
}

export async function appendEntry(
  ctx: PermCtx,
  pageId: string,
  input: { content: string; source?: unknown },
): Promise<{ versionId: string; versionNumber: number }> {
  const parsedSource = input.source === undefined ? undefined : rawSourceSchema.safeParse(input.source);
  if (parsedSource && !parsedSource.success) throw new DomainError('BAD_REQUEST', 'Raw entry source metadata is invalid');
  if (!input.content.trim()) throw new DomainError('BAD_REQUEST', 'Raw append content is required');

  const space = await rawSpace();
  const userId = assertRawWriteAccess(ctx, space);
  await assertNotMigrating();
  const revisionId = randomUUID();

  const appended = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    await tx.execute(sql`select id from pages where id = ${pageId} for update`);
    const page = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.id, pageId), eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)),
    });
    if (!page) throw new DomainError('FORBIDDEN', 'Raw entries can only be appended in the raw space');
    if (!can(ctx, 'create', { kind: 'page', pageId }, pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }))) {
      throw new DomainError('SPACE_FORBIDDEN', 'You do not have permission to append raw entries');
    }
    if (!page.latestVersionId) throw new DomainError('NOT_FOUND', 'Raw entry has no current revision');
    const current = await tx.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page.latestVersionId) });
    if (!current?.contentSource) throw new DomainError('NOT_FOUND', 'Raw entry content is unavailable');

    const versionRows = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, page.id));
    const nextVersion = (versionRows[0]?.value ?? 0) + 1;
    const contentSource = `${current.contentSource}${RAW_APPEND_SEPARATOR}${input.content}`;
    const { html, hash } = renderMarkdown(contentSource);
    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: nextVersion,
        contentType: 'text/markdown',
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'published',
        actorKind: actorKindOf(ctx),
        sourceMetadata: parsedSource?.data ?? null,
        publishedAt: new Date(),
      })
      .returning();
    if (!revision) throw new Error('Failed to append raw revision');
    await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: space.id, source: contentSource, fallbackTitle: page.title });
    await syncRevisionAssetRefs(tx, revision.id, contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);
    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id, currentPublishedVersionId: revision.id, updatedAt: new Date() })
      .where(eq(schema.pages.id, page.id));
    return { versionId: revision.id, versionNumber: revision.versionNumber };
  });

  await kickReplication();
  return appended;
}
