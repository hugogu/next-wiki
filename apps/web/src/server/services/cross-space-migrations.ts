import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { PermCtx } from '@/server/permissions';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { assertNoSwitchInProgress, assertSpaceKindAllowed } from '@/server/services/writing-mode';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { renderPageMarkdown } from '@/server/services/wiki-links';
import { deriveOkfTypeFromPath, ensureOkfConformance, ensureOkfConceptPath } from '@/server/services/okf';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { persistRevisionMetadata, getRevisionMetadata } from '@/server/services/page-metadata';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { invalidatePublicContentCache, runWithoutDataCache } from '@/server/cache/public-cache';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import type {
  SpaceMigrationConfirmInput,
  SpaceMigrationItem,
  SpaceMigrationOperation,
  SpaceMigrationPreview,
  SpaceMigrationPreviewInput,
} from '@next-wiki/shared';

const PREVIEW_TTL_MS = 4 * 60 * 60 * 1000;
type MigrationRow = typeof schema.crossSpaceMigrations.$inferSelect;
type ItemRow = typeof schema.crossSpaceMigrationItems.$inferSelect;
type SnapshotItem = { pageId: string; sourcePath: string; destinationPath: string; locale: string; updatedAt: string; warning?: string };
type Snapshot = { items: SnapshotItem[]; sourceSpaceId: string; destinationSpaceId: string };

function assertMigrationAdmin(ctx: PermCtx): string {
  const actor = ctx.actor;
  if (actor.kind === 'user' && actor.role === 'admin') return actor.userId;
  // Preview exposes source paths and destinations, so a machine caller needs
  // both read and edit authority; `edit` alone deliberately does not imply
  // `view` for API keys.
  if (actor.kind === 'api_key' && actor.role === 'admin' && actor.scopes.includes('view') && actor.scopes.includes('edit')) return actor.userId;
  throw new DomainError('FORBIDDEN', 'Administrator authority is required for cross-space migration');
}

function fingerprint(snapshot: Snapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function appendPath(prefix: string | undefined, relative: string): string {
  return [prefix?.replace(/^\/+|\/+$/g, ''), relative.replace(/^\/+/, '')].filter(Boolean).join('/');
}

function relativeTo(prefix: string, path: string): string {
  return path === prefix ? path.split('/').at(-1)! : path.slice(prefix.length + 1);
}

function warningFor(page: typeof schema.pages.$inferSelect, destination: typeof schema.spaces.$inferSelect): string | undefined {
  if (destination.kind === 'generated' && page.nature !== 'generated') return 'The page will be classified as generated in AI Generation.';
  return undefined;
}

async function resolveSelection(input: SpaceMigrationPreviewInput) {
  const selected = input.selection;
  let sourceSpaceId: string;
  let pages: (typeof schema.pages.$inferSelect)[];
  let basePath: string | null = null;
  if (selected.kind === 'page') {
    const page = await db.query.pages.findFirst({ where: and(eq(schema.pages.id, selected.pageId), isNull(schema.pages.deletedAt)) });
    if (!page || page.translationGroupId || page.kind !== 'native') {
      throw new DomainError('MIGRATION_SELECTION_INVALID', 'Select an active source page, not a translation or link');
    }
    sourceSpaceId = page.spaceId;
    const translations = await db.query.pages.findMany({
      where: and(eq(schema.pages.sourcePageId, page.id), isNull(schema.pages.deletedAt)),
    });
    pages = [page, ...translations];
  } else {
    sourceSpaceId = selected.sourceSpaceId;
    basePath = selected.pathPrefix;
    pages = await db.query.pages.findMany({
      where: and(
        eq(schema.pages.spaceId, sourceSpaceId),
        isNull(schema.pages.deletedAt),
        eq(schema.pages.kind, 'native'),
        or(eq(schema.pages.path, basePath), sql`${schema.pages.path} like ${`${basePath}/%`}`),
      ),
      orderBy: [asc(schema.pages.path), asc(schema.pages.locale)],
    });
    if (!pages.length) throw new DomainError('MIGRATION_SELECTION_INVALID', 'The selected folder has no movable pages');
  }
  return { sourceSpaceId, pages, basePath };
}

async function validateSpaces(sourceSpaceId: string, destinationSpaceId: string) {
  const [source, destination] = await Promise.all([
    db.query.spaces.findFirst({ where: eq(schema.spaces.id, sourceSpaceId) }),
    db.query.spaces.findFirst({ where: eq(schema.spaces.id, destinationSpaceId) }),
  ]);
  if (!source || !destination) throw new DomainError('MIGRATION_DESTINATION_INVALID', 'Source or destination space was not found');
  await assertSpaceKindAllowed(source.kind);
  await assertSpaceKindAllowed(destination.kind);
  if (source.kind === 'raw' || destination.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Raw space cannot participate in migration');
  if (source.id === destination.id) throw new DomainError('MIGRATION_DESTINATION_INVALID', 'Source and destination must differ');
  return { source, destination };
}

function itemView(item: ItemRow, canonicalUrl?: string | null): SpaceMigrationItem {
  return { id: item.id, pageId: item.pageId, sourcePath: item.sourcePath, destinationPath: item.destinationPath, locale: item.locale, status: item.status, warning: item.warning, failure: item.failure, canonicalUrl };
}

function operationView(row: MigrationRow, items: ItemRow[]): SpaceMigrationOperation {
  return {
    id: row.id,
    status: row.status,
    sourceSpaceId: row.sourceSpaceId,
    destinationSpaceId: row.destinationSpaceId,
    totalItems: items.length,
    movedItems: items.filter((item) => item.status === 'moved').length,
    warningCount: row.warningCount,
    failedItems: items.filter((item) => item.status === 'failed' || item.status === 'conflicted').length,
    cancellationRequested: row.cancellationRequestedAt !== null,
    failure: row.failure,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function previewCrossSpaceMigration(ctx: PermCtx, input: SpaceMigrationPreviewInput): Promise<SpaceMigrationPreview> {
  const userId = assertMigrationAdmin(ctx);
  const { sourceSpaceId, pages, basePath } = await resolveSelection(input);
  const { source, destination } = await validateSpaces(sourceSpaceId, input.destinationSpaceId);
  const destinationPrefix = input.destinationPathPrefix;
  const items: SnapshotItem[] = [];
  for (const page of pages) {
    // A page keeps its canonical path unless the caller explicitly selects a
    // destination folder. A folder selection always maps descendants relative
    // to the selected prefix.
    const relative = basePath
      ? destinationPrefix ? relativeTo(basePath, page.path) : page.path
      : destinationPrefix ? page.path.split('/').at(-1)! : page.path;
    const destinationPath = appendPath(destinationPrefix, basePath ? relative : relative);
    const exists = await db.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, destination.id), eq(schema.pages.path, destinationPath), eq(schema.pages.locale, page.locale), isNull(schema.pages.deletedAt), ne(schema.pages.id, page.id)),
    });
    const warning = exists ? 'Destination path already exists; this item will remain unchanged.' : warningFor(page, destination);
    items.push({ pageId: page.id, sourcePath: page.path, destinationPath, locale: page.locale, updatedAt: page.updatedAt.toISOString(), ...(warning ? { warning } : {}) });
  }
  const snapshot: Snapshot = { items, sourceSpaceId: source.id, destinationSpaceId: destination.id };
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
  const [row] = await db.insert(schema.crossSpaceMigrations).values({
    requestedBy: userId,
    sourceSpaceId: source.id,
    destinationSpaceId: destination.id,
    selectionKind: input.selection.kind,
    selectionPageId: input.selection.kind === 'page' ? input.selection.pageId : null,
    selectionPath: input.selection.kind === 'folder' ? input.selection.pathPrefix : null,
    destinationPathPrefix: destinationPrefix ?? null,
    visibility: input.visibility ?? null,
    adaptOkf: input.adaptOkf,
    fingerprint: fingerprint(snapshot),
    snapshot,
    warningCount: items.filter((item) => item.warning).length,
    expiresAt,
  }).returning();
  if (!row) throw new Error('Failed to persist migration preview');
  return {
    id: row.id, fingerprint: row.fingerprint, status: 'previewed',
    sourceSpace: { id: source.id, slug: source.slug, kind: source.kind as 'wiki' | 'generated' },
    destinationSpace: { id: destination.id, slug: destination.slug, kind: destination.kind as 'wiki' | 'generated' },
    items: items.map((item) => ({ id: randomUUID(), pageId: item.pageId, sourcePath: item.sourcePath, destinationPath: item.destinationPath, locale: item.locale, status: item.warning?.startsWith('Destination path') ? 'conflicted' : 'pending', warning: item.warning ?? null, failure: null })),
    warningCount: row.warningCount,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function confirmCrossSpaceMigration(ctx: PermCtx, input: SpaceMigrationConfirmInput): Promise<SpaceMigrationOperation> {
  const userId = assertMigrationAdmin(ctx);
  const { operation, enqueueOperation } = await db.transaction(async (tx) => {
    const row = await tx.query.crossSpaceMigrations.findFirst({ where: eq(schema.crossSpaceMigrations.id, input.previewId) });
    if (!row || row.requestedBy !== userId || row.status === 'previewed' && (!row.expiresAt || row.expiresAt < new Date())) {
      throw new DomainError('MIGRATION_PREVIEW_NOT_FOUND', 'Migration preview was not found');
    }
    if (row.fingerprint !== input.fingerprint) throw new DomainError('STALE_MIGRATION_PREVIEW', 'Migration preview no longer matches the reviewed selection');
    if (row.status !== 'previewed') {
      const existing = await tx.query.crossSpaceMigrationItems.findMany({ where: eq(schema.crossSpaceMigrationItems.migrationId, row.id) });
      return { operation: operationView(row, existing), enqueueOperation: false };
    }
    await assertNoSwitchInProgress(tx);
    const snapshot = row.snapshot as Snapshot;
    for (const item of snapshot.items) {
      const page = await tx.query.pages.findFirst({ where: eq(schema.pages.id, item.pageId) });
      if (!page || page.updatedAt.toISOString() !== item.updatedAt || page.spaceId !== row.sourceSpaceId) {
        throw new DomainError('STALE_MIGRATION_PREVIEW', 'A selected page changed after preview');
      }
    }
    if (snapshot.items.some((item) => item.warning?.startsWith('Destination path'))) {
      throw new DomainError('MIGRATION_CONFLICT', 'Resolve destination conflicts and create a new preview before confirming');
    }
    await tx.insert(schema.crossSpaceMigrationItems).values(snapshot.items.map((item, ordinal) => ({
      migrationId: row.id, pageId: item.pageId, ordinal, sourcePath: item.sourcePath, destinationPath: item.destinationPath,
      locale: item.locale, status: item.warning?.startsWith('Destination path') ? 'conflicted' as const : 'pending' as const, warning: item.warning ?? null,
    })));
    const [updated] = await tx.update(schema.crossSpaceMigrations).set({ status: 'queued', expiresAt: null, updatedAt: new Date() }).where(eq(schema.crossSpaceMigrations.id, row.id)).returning();
    const items = await tx.query.crossSpaceMigrationItems.findMany({ where: eq(schema.crossSpaceMigrationItems.migrationId, row.id) });
    if (!updated) throw new Error('Failed to confirm migration');
    return { operation: operationView(updated, items), enqueueOperation: true };
  });
  if (enqueueOperation) await enqueue(QUEUES.crossSpaceMigration, { migrationId: operation.id }, { singletonKey: operation.id, singletonSeconds: 60 });
  return operation;
}

export async function getCrossSpaceMigration(ctx: PermCtx, id: string): Promise<SpaceMigrationOperation> {
  const userId = assertMigrationAdmin(ctx);
  const row = await db.query.crossSpaceMigrations.findFirst({ where: and(eq(schema.crossSpaceMigrations.id, id), eq(schema.crossSpaceMigrations.requestedBy, userId)) });
  if (!row) throw new DomainError('MIGRATION_PREVIEW_NOT_FOUND', 'Migration not found');
  const items = await db.query.crossSpaceMigrationItems.findMany({ where: eq(schema.crossSpaceMigrationItems.migrationId, id) });
  return operationView(row, items);
}

export async function listCrossSpaceMigrationItems(ctx: PermCtx, id: string, limit = 50, cursor?: string) {
  const userId = assertMigrationAdmin(ctx);
  const row = await db.query.crossSpaceMigrations.findFirst({ where: and(eq(schema.crossSpaceMigrations.id, id), eq(schema.crossSpaceMigrations.requestedBy, userId)) });
  if (!row) throw new DomainError('MIGRATION_PREVIEW_NOT_FOUND', 'Migration not found');
  const items = await db.query.crossSpaceMigrationItems.findMany({
    where: and(eq(schema.crossSpaceMigrationItems.migrationId, id), cursor ? gt(schema.crossSpaceMigrationItems.id, cursor) : undefined),
    orderBy: [asc(schema.crossSpaceMigrationItems.id)], limit: limit + 1,
  });
  const page = items.slice(0, limit);
  return { items: page.map((item) => itemView(item)), nextCursor: items.length > limit ? page.at(-1)!.id : null };
}

export async function cancelCrossSpaceMigration(ctx: PermCtx, id: string): Promise<SpaceMigrationOperation> {
  const userId = assertMigrationAdmin(ctx);
  const [row] = await db.update(schema.crossSpaceMigrations).set({ cancellationRequestedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.crossSpaceMigrations.id, id), eq(schema.crossSpaceMigrations.requestedBy, userId), inArray(schema.crossSpaceMigrations.status, ['queued', 'running']))).returning();
  if (!row) return getCrossSpaceMigration(ctx, id);
  const items = await db.query.crossSpaceMigrationItems.findMany({ where: eq(schema.crossSpaceMigrationItems.migrationId, id) });
  return operationView(row, items);
}

export async function findRecoverableCrossSpaceMigrationIds(): Promise<string[]> {
  const rows = await db.select({ id: schema.crossSpaceMigrations.id }).from(schema.crossSpaceMigrations).where(inArray(schema.crossSpaceMigrations.status, ['queued', 'running']));
  return rows.map((row) => row.id);
}

async function moveItem(row: MigrationRow, item: ItemRow): Promise<void> {
  const effect = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({ where: and(eq(schema.pages.id, item.pageId), eq(schema.pages.spaceId, row.sourceSpaceId), isNull(schema.pages.deletedAt)) });
    if (!page) throw new DomainError('NOT_FOUND', 'Selected page no longer exists in the source space');
    const [source, destination] = await Promise.all([
      tx.query.spaces.findFirst({ where: eq(schema.spaces.id, row.sourceSpaceId) }),
      tx.query.spaces.findFirst({ where: eq(schema.spaces.id, row.destinationSpaceId) }),
    ]);
    if (!source || !destination || source.kind === 'raw' || destination.kind === 'raw') throw new DomainError('RAW_SPACE_IMMUTABLE', 'Migration spaces are no longer eligible');
    const conflict = await tx.query.pages.findFirst({ where: and(eq(schema.pages.spaceId, destination.id), eq(schema.pages.path, item.destinationPath), eq(schema.pages.locale, page.locale), isNull(schema.pages.deletedAt), ne(schema.pages.id, page.id)) });
    if (conflict) throw new DomainError('PAGE_PATH_CONFLICT', 'Destination path now exists');
    if (destination.kind === 'generated') ensureOkfConceptPath(item.destinationPath);
    const primaryId = page.currentPublishedVersionId ?? page.latestVersionId;
    let replacementId: string | null = null;
    if (primaryId) {
      const revision = await tx.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, primaryId) });
      if (revision) {
        const original = await readMarkdownWithFallback(revision);
        const source = destination.kind === 'generated' && row.adaptOkf
          ? ensureOkfConformance(original, { title: page.title, now: new Date(), fallbackType: deriveOkfTypeFromPath(item.destinationPath) })
          : original;
        const { html, hash } = await renderPageMarkdown(destination, source, { executor: tx, locale: page.locale });
        const [last] = await tx.select({ value: sql<number>`max(${schema.pageRevisions.versionNumber})` }).from(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, page.id));
        replacementId = randomUUID();
        await tx.insert(schema.pageRevisions).values({ id: replacementId, pageId: page.id, versionNumber: (last?.value ?? 0) + 1, locale: page.locale, contentType: revision.contentType, contentSource: source, contentHtml: html, contentHash: hash, authorId: row.requestedBy, status: revision.status, actorKind: 'human', sourceMetadata: revision.sourceMetadata, linkTargetPageId: revision.linkTargetPageId, originalAssetId: revision.originalAssetId, publishedAt: revision.status === 'published' ? new Date() : null });
        const metadata = await getRevisionMetadata(revision.id);
        await persistRevisionMetadata(tx, { revisionId: replacementId, spaceId: destination.id, source, fallbackTitle: page.title, metadata: { title: page.title, date: metadata.date, summary: metadata.summary, tags: metadata.tags.map((tag) => tag.name) } });
        await syncRevisionAssetRefs(tx, replacementId, source);
        await addReplicationTasks(tx, 'markdown', replacementId, hash);
      }
    }
    // 035 (FR-010): a cross-space move MUST NOT change the page's canonical
    // address — `slug` is deliberately left untouched. The address a reader
    // could reach this page at before the move (its slug, or for a
    // translation, `{locale}/{source slug}`) is retained against the
    // *source* space, since `page_addresses` is space-scoped and the page
    // has just left it.
    let legacyAddress = page.slug;
    if (page.sourcePageId) {
      const sourcePage = await tx.query.pages.findFirst({ where: eq(schema.pages.id, page.sourcePageId) });
      legacyAddress = `${page.locale}/${sourcePage?.slug ?? page.slug}`;
    }
    await tx
      .insert(schema.pageAddresses)
      .values({ spaceId: source.id, address: legacyAddress, pageId: page.id, kind: 'retained', reason: 'cross_space_migration' })
      .onConflictDoUpdate({
        target: [schema.pageAddresses.spaceId, schema.pageAddresses.address],
        set: { pageId: page.id, reason: 'cross_space_migration' },
      });
    // Moving back into a space this page previously left leaves that space's
    // retained alias duplicating the page's own canonical address again; drop
    // it, exactly as `setSlug` does for an A -> B -> A rename.
    await tx
      .delete(schema.pageAddresses)
      .where(and(
        eq(schema.pageAddresses.pageId, page.id),
        eq(schema.pageAddresses.spaceId, destination.id),
        eq(schema.pageAddresses.address, legacyAddress),
      ));
    await tx.update(schema.pages).set({ spaceId: destination.id, path: item.destinationPath, nature: destination.kind === 'generated' ? 'generated' : page.nature, visibility: row.visibility ?? page.visibility, latestVersionId: replacementId ?? page.latestVersionId, currentPublishedVersionId: replacementId && primaryId === page.currentPublishedVersionId ? replacementId : page.currentPublishedVersionId, updatedAt: new Date() }).where(eq(schema.pages.id, page.id));
    await tx.update(schema.crossSpaceMigrationItems).set({ status: 'moved', completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.crossSpaceMigrationItems.id, item.id));
    return { pageId: page.id, source, destination, path: item.destinationPath, slug: page.slug, locale: page.locale, legacyAddress, published: page.currentPublishedVersionId !== null };
  });
  invalidatePublicContentCache();
  await reconcilePageAcrossIndexes(effect.pageId, { actor: { kind: 'user', userId: row.requestedBy, role: 'admin' } });
  await notifyPublicContentChanged('publish');
  if (effect.published) {
    await enqueuePublicPageWarmup(canonicalSpacePath(effect.destination, effect.slug, effect.locale));
    // 035 (T081): the address a reader could reach this page at before the
    // move is now a retained alias in the *source* space — warm it too, or
    // the first visitor to follow an old bookmark or search result hits a
    // cold cache instead of an instantly-cached redirect. `legacyAddress` is
    // already locale-prefixed as text where applicable (see its definition
    // above), so it is passed through with `locale: null` rather than
    // letting `canonicalSpacePath` prefix it a second time.
    await enqueuePublicPageWarmup(canonicalSpacePath(effect.source, effect.legacyAddress, null));
  }
}

async function finalizeMigration(id: string): Promise<void> {
  const row = await db.query.crossSpaceMigrations.findFirst({ where: eq(schema.crossSpaceMigrations.id, id) });
  if (!row) return;
  const items = await db.query.crossSpaceMigrationItems.findMany({ where: eq(schema.crossSpaceMigrationItems.migrationId, id) });
  const hasFailures = items.some((item) => ['failed', 'conflicted'].includes(item.status));
  const cancelled = row.cancellationRequestedAt !== null;
  const noItemsMoved = items.length > 0 && items.every((item) => ['failed', 'conflicted'].includes(item.status));
  const terminal = cancelled ? 'cancelled' : noItemsMoved ? 'failed' : hasFailures || row.warningCount ? 'completed_with_warnings' : 'completed';
  await db.update(schema.crossSpaceMigrations).set({ status: terminal, completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.crossSpaceMigrations.id, id));
  await kickReplication();
}

export async function runCrossSpaceMigration(id: string): Promise<void> {
  return runWithoutDataCache(async () => {
    const row = await db.query.crossSpaceMigrations.findFirst({ where: eq(schema.crossSpaceMigrations.id, id) });
    if (!row || !['queued', 'running'].includes(row.status)) return;
    await db.update(schema.crossSpaceMigrations).set({ status: 'running', startedAt: row.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(schema.crossSpaceMigrations.id, id));
    const items = await db.query.crossSpaceMigrationItems.findMany({ where: and(eq(schema.crossSpaceMigrationItems.migrationId, id), eq(schema.crossSpaceMigrationItems.status, 'pending')), orderBy: [asc(schema.crossSpaceMigrationItems.ordinal)] });
    for (const item of items) {
      const current = await db.query.crossSpaceMigrations.findFirst({ where: eq(schema.crossSpaceMigrations.id, id) });
      if (!current || current.cancellationRequestedAt) {
        await db.update(schema.crossSpaceMigrationItems).set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.crossSpaceMigrationItems.migrationId, id), eq(schema.crossSpaceMigrationItems.status, 'pending')));
        break;
      }
      await db.update(schema.crossSpaceMigrationItems).set({ status: 'running', startedAt: new Date(), updatedAt: new Date() }).where(eq(schema.crossSpaceMigrationItems.id, item.id));
      try { await moveItem(current, item); } catch (error) {
        await db.update(schema.crossSpaceMigrationItems).set({ status: error instanceof DomainError && error.code === 'PAGE_PATH_CONFLICT' ? 'conflicted' : 'failed', failure: error instanceof Error ? error.message : 'Migration failed', completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.crossSpaceMigrationItems.id, item.id));
      }
    }
    await finalizeMigration(id);
  });
}
