import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type {
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
import { enqueue, QUEUES } from '@/server/jobs/runtime';

const ACTIVE = ['queued', 'running'] as const;

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
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    errorDetail: row.errorDetail,
    reportArtifactId: row.reportArtifactId,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    canCancel: ACTIVE.includes(row.status as (typeof ACTIVE)[number]),
    canRetry: ['failed', 'cancelled'].includes(row.status),
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

/**
 * Read the live cancellation flag for a run straight from the DB. Import
 * workers hold a row snapshot captured when the job started, so they must poll
 * this — not their in-memory `run.cancelRequested` — to notice a cancellation
 * requested after they began.
 */
export async function isRunCancelRequested(id: string): Promise<boolean> {
  const row = await db
    .select({ cancelRequested: schema.transferRuns.cancelRequested })
    .from(schema.transferRuns)
    .where(eq(schema.transferRuns.id, id))
    .limit(1);
  return row[0]?.cancelRequested ?? false;
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
