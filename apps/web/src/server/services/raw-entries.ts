import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull, max, sql } from 'drizzle-orm';
import { mimeTypeSchema, pageAddressSchema, pathSchema, rawInputKindSchema, rawSourceSchema, type RawInputKind, type RawSource } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, pagePermissionOptions, spacePermissionOptions, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { persistRevisionMetadata } from '@/server/services/page-metadata';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { assertNotMigrating } from '@/server/services/migration';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { actorKindOf } from '@/server/services/pages';
import { getEffectiveDefaultVisibility, resolveSpace } from '@/server/services/spaces';
import { resolveCategoryForCreate } from '@/server/services/raw-categories';
import { renderPageMarkdown } from '@/server/services/wiki-links';
import { assertNoSwitchInProgress, assertSpaceKindAllowed } from '@/server/services/writing-mode';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { DatabaseStore } from '@/server/content-store/database-store';
import { writeAsset } from '@/server/content-store/atomic-write';
import { normalizeContentType, sniffRawContentType } from '@/server/content-store/raw-sniffing';

const RAW_APPEND_SEPARATOR = '\n\n---\n\n';
const RAW_ASSET_KIND = 'raw';
const DEFAULT_RAW_CONTENT_TYPE = 'text/markdown';

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

/** Raw entries carry `inputKind` + optional source metadata in the revision's
 * JSONB `source_metadata` — never as injected frontmatter (2026-07-19). */
type RawSourceMetadata = { inputKind: RawInputKind } & RawSource;

/**
 * Resolve the stored MIME type and verify it against the original bytes when
 * present. The declared type is normalized to a bare `type/subtype`; a sniffable
 * disagreement is rejected so a declared type can never misrepresent the bytes.
 */
function resolveContentType(declared: unknown, originalBytes: Buffer | null): string {
  const raw = declared === undefined || declared === null ? DEFAULT_RAW_CONTENT_TYPE : String(declared);
  const normalized = normalizeContentType(raw);
  if (!mimeTypeSchema.safeParse(normalized).success) {
    throw new DomainError('RAW_CONTENT_TYPE_INVALID', `Invalid content type '${raw}'`);
  }
  if (originalBytes) {
    const sniffed = sniffRawContentType(originalBytes);
    if (sniffed && sniffed !== normalized) {
      throw new DomainError('RAW_CONTENT_TYPE_MISMATCH', `Declared content type '${normalized}' does not match the uploaded bytes (${sniffed})`);
    }
  }
  return normalized;
}

function decodeOriginalBytes(value: unknown): Buffer | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new DomainError('BAD_REQUEST', 'originalBytes must be a base64 string');
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length === 0) throw new DomainError('BAD_REQUEST', 'originalBytes is empty or not valid base64');
  return buffer;
}

/**
 * Persist raw original bytes through the shared content-store (Database backend
 * with replication to any external backend), returning the asset id referenced
 * immutably by the revision. Written before the entry transaction so a rolled
 * back revision leaves only an unreferenced object that orphan cleanup reclaims.
 */
async function storeOriginalBytes(bytes: Buffer, contentType: string, userId: string | null): Promise<string> {
  const { id } = await writeAsset(new DatabaseStore(), {
    kind: RAW_ASSET_KIND,
    bytes,
    contentType,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    createdBy: userId,
  });
  return id;
}

async function rawSpace() {
  await assertSpaceKindAllowed('raw');
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') throw new DomainError('NOT_FOUND', 'Raw space not found');
  return { ...space, kind: 'raw' as const };
}

export async function createEntry(
  ctx: PermCtx,
  input: {
    path: string;
    /** Optional canonical reader address. Internal mirrors use this to keep
     * the case-sensitive source path in provenance while storage remains a
     * server-derived, lowercase tree path. */
    slug?: string;
    title: string;
    inputKind: unknown;
    source?: unknown;
    /** Additional trusted provenance fields for server integrations. */
    additionalSourceMetadata?: Record<string, unknown>;
    content: string;
    /** Internal integrations may force private visibility instead of using the
     * Raw space default. Public API callers leave this unset. */
    visibility?: 'public' | 'registered' | 'restricted';
    contentType?: unknown;
    originalBytes?: unknown;
    categoryId?: string;
  },
): Promise<{ pageId: string; versionId: string }> {
  const parsedPath = pathSchema.safeParse(input.path);
  if (!parsedPath.success) throw new DomainError('BAD_REQUEST', parsedPath.error.issues[0]?.message ?? 'Invalid path');
  const parsedSlug = input.slug === undefined ? undefined : pageAddressSchema.safeParse(input.slug);
  if (parsedSlug && !parsedSlug.success) throw new DomainError('BAD_REQUEST', parsedSlug.error.issues[0]?.message ?? 'Invalid slug');
  const parsedKind = rawInputKindSchema.safeParse(input.inputKind);
  if (!parsedKind.success) throw new DomainError('BAD_REQUEST', 'Raw entries require a valid input kind');
  const parsedSource = input.source === undefined ? undefined : rawSourceSchema.safeParse(input.source);
  if (parsedSource && !parsedSource.success) throw new DomainError('BAD_REQUEST', 'Raw entry source metadata is invalid');
  if (!input.content.trim()) throw new DomainError('BAD_REQUEST', 'Raw entry content is required');

  const space = await rawSpace();
  const userId = assertRawWriteAccess(ctx, space);
  await assertNotMigrating();

  const originalBytes = decodeOriginalBytes(input.originalBytes);
  const contentType = resolveContentType(input.contentType, originalBytes);
  // Raw body is stored verbatim — no OKF frontmatter, no markdown conversion.
  const contentSource = input.content;
  const sourceMetadata: RawSourceMetadata & Record<string, unknown> = {
    ...(parsedSource?.data ?? {}),
    ...(input.additionalSourceMetadata ?? {}),
    inputKind: parsedKind.data,
  };
  const originalAssetId = originalBytes ? await storeOriginalBytes(originalBytes, contentType, userId) : null;
  const revisionId = randomUUID();
  const { html, hash } = await renderPageMarkdown(space, contentSource);

  const created = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    const categoryId = await resolveCategoryForCreate(input.categoryId, tx);
    const existing = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, parsedPath.data), isNull(schema.pages.translationGroupId)),
    });
    if (existing) throw new DomainError('CONFLICT', 'A page with this path already exists');

    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: space.id,
        slug: parsedSlug?.data ?? leafSlug(parsedPath.data),
        path: parsedPath.data,
        title: input.title,
        authorId: userId,
        nature: 'original',
        visibility: input.visibility ?? getEffectiveDefaultVisibility(space),
        rawCategoryId: categoryId,
      })
      .returning();
    if (!page) throw new Error('Failed to create raw entry');

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: 1,
        contentType,
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'published',
        actorKind: actorKindOf(ctx),
        sourceMetadata,
        originalAssetId,
        publishedAt: new Date(),
      })
      .returning();
    if (!revision) throw new Error('Failed to create raw revision');
    await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: space.id, source: contentSource, fallbackTitle: input.title });
    await syncRevisionAssetRefs(tx, revision.id, contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);
    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id, currentPublishedVersionId: revision.id, updatedAt: new Date() })
      .where(eq(schema.pages.id, page.id));
    return { pageId: page.id, versionId: revision.id };
  });

  await kickReplication();
  // Unlike normal page publish/update paths, raw create/append did not
  // previously reconcile active AI indexes — without this, a captured Raw
  // Conversation (023) would not become searchable until a manual rebuild.
  await reconcilePageAcrossIndexes(created.pageId, ctx);
  return created;
}

export async function appendEntry(
  ctx: PermCtx,
  pageId: string,
  input: { content: string; source?: unknown; contentType?: unknown; originalBytes?: unknown },
): Promise<{ versionId: string; versionNumber: number }> {
  const parsedSource = input.source === undefined ? undefined : rawSourceSchema.safeParse(input.source);
  if (parsedSource && !parsedSource.success) throw new DomainError('BAD_REQUEST', 'Raw entry source metadata is invalid');
  if (!input.content.trim()) throw new DomainError('BAD_REQUEST', 'Raw append content is required');

  const space = await rawSpace();
  const userId = assertRawWriteAccess(ctx, space);
  await assertNotMigrating();

  const originalBytes = decodeOriginalBytes(input.originalBytes);
  const chunkContentType = resolveContentType(input.contentType, originalBytes);
  const originalAssetId = originalBytes ? await storeOriginalBytes(originalBytes, chunkContentType, userId) : null;
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
    if (current?.contentSource === null || current?.contentSource === undefined) {
      throw new DomainError('NOT_FOUND', 'Raw entry content is unavailable');
    }

    const versionRows = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, page.id));
    const nextVersion = (versionRows[0]?.value ?? 0) + 1;
    // Server-side concatenation, byte-preserving: the prior body plus the chunk.
    const contentSource = `${current.contentSource}${RAW_APPEND_SEPARATOR}${input.content}`;
    const { html, hash } = await renderPageMarkdown(space, contentSource, { executor: tx });
    const sourceMetadata: RawSource | null = parsedSource?.data ?? null;
    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: nextVersion,
        // Preserve the entry's established content type; a chunk that supplies
        // its own bytes may narrow it, otherwise inherit the current revision's.
        contentType: input.contentType !== undefined ? chunkContentType : current.contentType,
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'published',
        actorKind: actorKindOf(ctx),
        sourceMetadata,
        originalAssetId,
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
  await reconcilePageAcrossIndexes(pageId, ctx);
  return appended;
}

/**
 * Replace a Raw document with one complete immutable snapshot. This is
 * intentionally separate from appendEntry: file mirrors receive the whole
 * current Markdown file on every delivery, so search and readers always see
 * the latest file rather than a concatenated event log.
 */
export async function replaceEntry(
  ctx: PermCtx,
  pageId: string,
  input: {
    content: string;
    inputKind?: unknown;
    source?: unknown;
    additionalSourceMetadata?: Record<string, unknown>;
    contentType?: unknown;
  },
): Promise<{ pageId: string; versionId: string; versionNumber: number; unchanged: boolean }> {
  if (!input.content.trim()) throw new DomainError('BAD_REQUEST', 'Raw snapshot content is required');
  const parsedKind = rawInputKindSchema.safeParse(input.inputKind ?? 'manual-note');
  if (!parsedKind.success) throw new DomainError('BAD_REQUEST', 'Raw snapshot requires a valid input kind');
  const parsedSource = input.source === undefined ? undefined : rawSourceSchema.safeParse(input.source);
  if (parsedSource && !parsedSource.success) throw new DomainError('BAD_REQUEST', 'Raw snapshot source metadata is invalid');

  const space = await rawSpace();
  const userId = assertRawWriteAccess(ctx, space);
  await assertNotMigrating();
  const contentType = resolveContentType(input.contentType, null);
  const { html, hash } = renderMarkdown(input.content);
  const replaced = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    await tx.execute(sql`select id from pages where id = ${pageId} for update`);
    const page = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.id, pageId), eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)),
    });
    if (!page) throw new DomainError('NOT_FOUND', 'Raw entry not found');
    if (!can(ctx, 'create', { kind: 'page', pageId }, pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }))) {
      throw new DomainError('SPACE_FORBIDDEN', 'You do not have permission to replace this raw entry');
    }
    const currentId = page.currentPublishedVersionId ?? page.latestVersionId;
    if (!currentId) throw new DomainError('NOT_FOUND', 'Raw entry has no current revision');
    const current = await tx.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, currentId) });
    if (!current) throw new DomainError('NOT_FOUND', 'Raw entry revision not found');
    if (current.contentHash === hash && current.contentSource === input.content) {
      return { pageId: page.id, versionId: current.id, versionNumber: current.versionNumber, unchanged: true };
    }
    const versionRows = await tx.select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, page.id));
    const versionNumber = (versionRows[0]?.value ?? 0) + 1;
    const sourceMetadata: RawSourceMetadata & Record<string, unknown> = {
      ...(parsedSource?.data ?? {}),
      ...(input.additionalSourceMetadata ?? {}),
      inputKind: parsedKind.data,
    };
    const revisionId = randomUUID();
    const [revision] = await tx.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId: page.id,
      versionNumber,
      contentType: input.contentType !== undefined ? contentType : current.contentType,
      contentSource: input.content,
      contentHtml: html,
      contentHash: hash,
      authorId: userId,
      status: 'published',
      actorKind: actorKindOf(ctx),
      sourceMetadata,
      publishedAt: new Date(),
    }).returning();
    if (!revision) throw new Error('Failed to create raw snapshot revision');
    await persistRevisionMetadata(tx, { revisionId: revision.id, spaceId: space.id, source: input.content, fallbackTitle: page.title });
    await syncRevisionAssetRefs(tx, revision.id, input.content);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);
    await tx.update(schema.pages).set({
      latestVersionId: revision.id,
      currentPublishedVersionId: revision.id,
      updatedAt: new Date(),
    }).where(eq(schema.pages.id, page.id));
    return { pageId: page.id, versionId: revision.id, versionNumber, unchanged: false };
  });
  if (!replaced.unchanged) {
    await kickReplication();
    await reconcilePageAcrossIndexes(pageId, ctx);
  }
  return replaced;
}
