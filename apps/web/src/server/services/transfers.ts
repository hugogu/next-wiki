import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type {
  TransferCleanupResult,
  TransferItemList,
  TransferItemQuery,
  TransferItemView,
  TransferRunAccepted,
  TransferRunCreate,
  TransferRunList,
  TransferRunQuery,
  TransferRunView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { isMigrationActive } from './migration';
import { assertCanManageTransfers } from './transfer-sources';
import { reconcilePageAcrossIndexes } from './ai-index';
import { enqueueGitExport } from './git-export';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

const ACTIVE = ['queued', 'running'] as const;
const TERMINAL = ['completed', 'completed_with_warnings', 'failed', 'cancelled'] as const;
// Only the long-running Wiki.js import supports pause/resume; other kinds either
// finish quickly (preview, source test) or have a non-resumable asset phase.
const PAUSABLE_KINDS = ['wikijs_import'] as const;
// Cleanup deletes the pages a run created; only the Wiki.js import records the
// create/replace distinction its cleanup relies on.
const CLEANABLE_KINDS = ['wikijs_import'] as const;

type RunRow = typeof schema.transferRuns.$inferSelect;
type ItemRow = typeof schema.transferItems.$inferSelect;

function runView(row: RunRow): TransferRunView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    phase: row.phase,
    actorUserId: row.actorUserId,
    sourceId: row.sourceId,
    sourceArtifactId: row.sourceArtifactId,
    previewRunId: row.previewRunId,
    options: row.options as Record<string, unknown>,
    sourceFingerprint: row.sourceFingerprint,
    totalItems: row.totalItems,
    processedItems: row.processedItems,
    createdItems: row.createdItems,
    replacedItems: row.replacedItems,
    skippedItems: row.skippedItems,
    convertedItems: row.convertedItems,
    warningItems: row.warningItems,
    failedItems: row.failedItems,
    currentItem: row.currentItem,
    cancelRequested: row.cancelRequested,
    pauseRequested: row.pauseRequested,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    errorDetail: row.errorDetail,
    reportArtifactId: row.reportArtifactId,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    // A paused run can still be cancelled, so it counts as cancellable too.
    canCancel: ACTIVE.includes(row.status as (typeof ACTIVE)[number]) || row.status === 'paused',
    canRetry: ['failed', 'cancelled'].includes(row.status),
    canPause:
      ACTIVE.includes(row.status as (typeof ACTIVE)[number]) &&
      PAUSABLE_KINDS.includes(row.kind as (typeof PAUSABLE_KINDS)[number]),
    canResume: row.status === 'paused',
    // Offer cleanup only for a finished import that actually created pages.
    canCleanup:
      CLEANABLE_KINDS.includes(row.kind as (typeof CLEANABLE_KINDS)[number]) &&
      TERMINAL.includes(row.status as (typeof TERMINAL)[number]) &&
      row.createdItems > 0,
  };
}

function itemView(row: ItemRow): TransferItemView {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    sourceKey: row.sourceKey,
    displayName: row.displayName,
    targetKey: row.targetKey,
    action: row.action,
    status: row.status,
    bytesTotal: row.bytesTotal,
    bytesProcessed: row.bytesProcessed,
    warningCode: row.warningCode,
    warningMessage: row.warningMessage,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    metadata: row.metadata as Record<string, unknown>,
    attempts: row.attempts,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function queueFor(kind: RunRow['kind']) {
  if (kind === 'site_export') return QUEUES.transferExport;
  if (kind === 'archive_preview' || kind === 'wikijs_preview') return QUEUES.transferPreview;
  if (kind === 'wikijs_source_test') return QUEUES.transferSourceTest;
  return QUEUES.transferImport;
}

export async function create(
  ctx: PermCtx,
  input: TransferRunCreate,
): Promise<TransferRunAccepted> {
  const actorId = assertCanManageTransfers(ctx);
  const mutating = input.kind === 'archive_import' || input.kind === 'wikijs_import';
  let sourceId: string | null = 'sourceId' in input ? input.sourceId : null;
  let sourceArtifactId: string | null =
    'sourceArtifactId' in input ? input.sourceArtifactId : null;
  const previewRunId: string | null = 'previewRunId' in input ? input.previewRunId : null;
  let options: Record<string, unknown> = 'options' in input ? input.options : {};
  let sourceFingerprint: string | null = null;

  if (previewRunId) {
    const preview = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, previewRunId),
    });
    const expected =
      input.kind === 'archive_import' ? 'archive_preview' : 'wikijs_preview';
    if (!preview || preview.kind !== expected || !['completed', 'completed_with_warnings'].includes(preview.status)) {
      throw new DomainError('INVALID_TRANSFER_OPTIONS', 'A completed matching preview is required');
    }
    sourceId = preview.sourceId;
    sourceArtifactId = preview.sourceArtifactId;
    options = preview.options as Record<string, unknown>;
    sourceFingerprint = preview.sourceFingerprint;
  }
  if (sourceArtifactId) {
    const artifact = await db.query.transferArtifacts.findFirst({
      where: eq(schema.transferArtifacts.id, sourceArtifactId),
    });
    if (!artifact || artifact.status !== 'ready') {
      throw new DomainError('INVALID_TRANSFER_OPTIONS', 'Source archive is not ready');
    }
  }
  if (sourceId) {
    const source = await db.query.transferSources.findFirst({
      where: eq(schema.transferSources.id, sourceId),
    });
    if (!source || source.status === 'disabled') {
      throw new DomainError('INVALID_TRANSFER_OPTIONS', 'Transfer source is unavailable');
    }
  }
  if (mutating && (await isMigrationActive())) {
    throw new DomainError('TRANSFER_ALREADY_RUNNING', 'Content storage migration is active');
  }

  const expiresAt = new Date(Date.now() + env.TRANSFER_ARTIFACT_RETENTION_HOURS * 3_600_000);
  try {
    const [row] = await db
      .insert(schema.transferRuns)
      .values({
        kind: input.kind,
        actorUserId: actorId,
        sourceId,
        sourceArtifactId,
        previewRunId,
        activeMutationSlot: mutating ? true : null,
        options,
        sourceFingerprint,
        expiresAt,
      })
      .returning();
    await enqueue(queueFor(row!.kind), { runId: row!.id });
    return { id: row!.id, status: 'queued' };
  } catch (error) {
    if ((error as { code?: string }).code === '23505' && mutating) {
      throw new DomainError('TRANSFER_ALREADY_RUNNING', 'Another content import is active');
    }
    throw error;
  }
}

export async function list(ctx: PermCtx, query: TransferRunQuery): Promise<TransferRunList> {
  assertCanManageTransfers(ctx);
  const conditions: SQL[] = [];
  if (query.kind) conditions.push(eq(schema.transferRuns.kind, query.kind));
  if (query.status) conditions.push(eq(schema.transferRuns.status, query.status));
  if (query.sourceId) conditions.push(eq(schema.transferRuns.sourceId, query.sourceId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, totals] = await Promise.all([
    db.select().from(schema.transferRuns).where(where).orderBy(desc(schema.transferRuns.queuedAt)).limit(query.limit).offset(query.offset),
    db.select({ value: count() }).from(schema.transferRuns).where(where),
  ]);
  return { items: rows.map(runView), total: totals[0]?.value ?? 0 };
}

export async function get(ctx: PermCtx, id: string): Promise<TransferRunView> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferRuns.findFirst({
    where: eq(schema.transferRuns.id, id),
  });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer run not found');
  return runView(row);
}

export async function listItems(
  ctx: PermCtx,
  runId: string,
  query: TransferItemQuery,
): Promise<TransferItemList> {
  assertCanManageTransfers(ctx);
  const conditions: SQL[] = [eq(schema.transferItems.runId, runId)];
  if (query.kind) conditions.push(eq(schema.transferItems.kind, query.kind));
  if (query.status) conditions.push(eq(schema.transferItems.status, query.status));
  if (query.action) conditions.push(eq(schema.transferItems.action, query.action));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.transferItems).where(where).orderBy(schema.transferItems.createdAt).limit(query.limit).offset(query.offset),
    db.select({ value: count() }).from(schema.transferItems).where(where),
  ]);
  return { items: rows.map(itemView), total: totals[0]?.value ?? 0 };
}

export async function requestCancellation(ctx: PermCtx, id: string): Promise<TransferRunView> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, id) });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer run not found');
  // A paused run has no live worker to observe the cancel flag, so terminate it
  // directly and release its mutation slot. An active run is flagged and stops
  // itself at the next loop iteration.
  if (row.status === 'paused') {
    await markRunTerminal(id, 'cancelled');
    const done = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, id) });
    return runView(done!);
  }
  if (!ACTIVE.includes(row.status as (typeof ACTIVE)[number])) {
    throw new DomainError('RUN_NOT_ACTIVE', 'Transfer run is not active');
  }
  const [updated] = await db
    .update(schema.transferRuns)
    .set({ cancelRequested: true })
    .where(eq(schema.transferRuns.id, id))
    .returning();
  return runView(updated!);
}

export async function requestPause(ctx: PermCtx, id: string): Promise<TransferRunView> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, id) });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer run not found');
  if (!PAUSABLE_KINDS.includes(row.kind as (typeof PAUSABLE_KINDS)[number])) {
    throw new DomainError('RUN_NOT_PAUSABLE', 'This transfer run type cannot be paused');
  }
  if (!ACTIVE.includes(row.status as (typeof ACTIVE)[number])) {
    throw new DomainError('RUN_NOT_ACTIVE', 'Transfer run is not active');
  }
  const [updated] = await db
    .update(schema.transferRuns)
    .set({ pauseRequested: true })
    .where(eq(schema.transferRuns.id, id))
    .returning();
  return runView(updated!);
}

export async function resume(ctx: PermCtx, id: string): Promise<TransferRunAccepted> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, id) });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer run not found');
  if (row.status !== 'paused') {
    throw new DomainError('RUN_NOT_PAUSED', 'Only a paused transfer run can be resumed');
  }
  // Requeue the same run; the worker re-hydrates progress and skips finished
  // items. The mutation slot was held throughout the pause, so no competing
  // import can have started meanwhile.
  await db
    .update(schema.transferRuns)
    .set({ status: 'queued', pauseRequested: false })
    .where(eq(schema.transferRuns.id, id));
  await enqueue(queueFor(row.kind), { runId: id });
  return { id, status: 'queued' };
}

/**
 * Mark a run paused: stop it without releasing its mutation slot, so it can be
 * resumed later. Progress counters are already persisted incrementally by the
 * worker, so only the status is flipped here.
 */
export async function markRunPaused(id: string): Promise<void> {
  await db
    .update(schema.transferRuns)
    .set({ status: 'paused', pauseRequested: false, phase: 'writing_pages' })
    .where(eq(schema.transferRuns.id, id));
}

/**
 * Undo an import: soft-delete every page this run created (not the ones it
 * merely replaced) and drop them from the AI indexes. Idempotent — pages
 * already gone are skipped, so it can be run again safely.
 */
export async function cleanupRun(ctx: PermCtx, id: string): Promise<TransferCleanupResult> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, id) });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer run not found');
  if (!CLEANABLE_KINDS.includes(row.kind as (typeof CLEANABLE_KINDS)[number])) {
    throw new DomainError('RUN_NOT_CLEANABLE', 'This transfer run type cannot be cleaned up');
  }
  if (!TERMINAL.includes(row.status as (typeof TERMINAL)[number])) {
    throw new DomainError('RUN_NOT_CLEANABLE', 'Only a finished transfer run can be cleaned up');
  }
  // Pages this run created. `action` shows 'convert' for converted pages, so
  // also consult the create/replace value persisted in item metadata.
  const created = await db
    .select({ pageId: schema.transferItems.targetKey })
    .from(schema.transferItems)
    .where(
      and(
        eq(schema.transferItems.runId, id),
        eq(schema.transferItems.kind, 'page'),
        isNotNull(schema.transferItems.targetKey),
        or(
          eq(schema.transferItems.action, 'create'),
          sql`${schema.transferItems.metadata} ->> 'importAction' = 'create'`,
        ),
      ),
    );
  const pageIds = created.map((item) => item.pageId).filter((value): value is string => Boolean(value));
  if (!pageIds.length) return { id, deletedPages: 0 };
  // Only touch pages that still exist so a re-run is a no-op.
  const existing = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(inArray(schema.pages.id, pageIds), isNull(schema.pages.deletedAt)));
  const toDelete = existing.map((page) => page.id);
  if (!toDelete.length) return { id, deletedPages: 0 };
  await db
    .update(schema.pages)
    .set({ deletedAt: new Date() })
    .where(inArray(schema.pages.id, toDelete));
  // Drop each page from every active index (targetRevision null → chunks removed).
  for (const pageId of toDelete) await reconcilePageAcrossIndexes(pageId, ctx);
  // One snapshot export reflects all the deletions.
  await enqueueGitExport('publish');
  return { id, deletedPages: toDelete.length };
}

/**
 * Read the live control signal for a run straight from the DB. Import workers
 * hold a row snapshot captured when the job started, so they must poll this —
 * not their in-memory flags — to notice a cancel/pause requested after they
 * began. Cancellation takes priority over a pause requested at the same time.
 */
export async function readRunControlSignal(id: string): Promise<'cancel' | 'pause' | null> {
  const row = await db
    .select({
      cancelRequested: schema.transferRuns.cancelRequested,
      pauseRequested: schema.transferRuns.pauseRequested,
    })
    .from(schema.transferRuns)
    .where(eq(schema.transferRuns.id, id))
    .limit(1);
  if (row[0]?.cancelRequested) return 'cancel';
  if (row[0]?.pauseRequested) return 'pause';
  return null;
}

/**
 * Read the live cancellation flag for a run straight from the DB, used by the
 * archive import loop which supports cancel but not pause.
 */
export async function isRunCancelRequested(id: string): Promise<boolean> {
  return (await readRunControlSignal(id)) === 'cancel';
}

export async function retry(ctx: PermCtx, id: string): Promise<TransferRunAccepted> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, id) });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer run not found');
  if (!['failed', 'cancelled'].includes(row.status)) {
    throw new DomainError('INVALID_TRANSFER_OPTIONS', 'Only failed or cancelled runs can retry');
  }
  const input =
    row.kind === 'site_export'
      ? ({ kind: 'site_export' } as const)
      : row.kind === 'archive_import'
        ? ({ kind: 'archive_import', previewRunId: row.previewRunId! } as const)
        : row.kind === 'wikijs_import'
          ? ({ kind: 'wikijs_import', previewRunId: row.previewRunId! } as const)
          : row.kind === 'archive_preview'
            ? ({ kind: 'archive_preview', sourceArtifactId: row.sourceArtifactId!, options: row.options as { conflictStrategy: 'skip' | 'replace' } } as const)
            : row.kind === 'wikijs_preview'
              ? ({ kind: 'wikijs_preview', sourceId: row.sourceId!, options: row.options as { conflictStrategy: 'skip' | 'replace' } } as const)
              : ({ kind: 'wikijs_source_test', sourceId: row.sourceId! } as const);
  return create(ctx, input);
}

export async function findRecoverableTransferRunIds(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.transferRuns.id })
    .from(schema.transferRuns)
    .where(inArray(schema.transferRuns.status, ['queued', 'running']));
  return rows.map((row) => row.id);
}

export async function markRunTerminal(
  id: string,
  status: Extract<
    RunRow['status'],
    'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
  >,
  values: Partial<RunRow> = {},
): Promise<void> {
  await db
    .update(schema.transferRuns)
    .set({
      ...values,
      status,
      phase: 'completed',
      activeMutationSlot: null,
      finishedAt: new Date(),
      currentItem: null,
    })
    .where(eq(schema.transferRuns.id, id));
}
