import { and, eq, inArray, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { TransferArtifactReserve, TransferArtifactView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { assertCanManageTransfers } from './transfer-sources';

type ArtifactRow = typeof schema.transferArtifacts.$inferSelect;

function cleanFilename(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 255);
}

export function toArtifactView(row: ArtifactRow): TransferArtifactView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    runId: row.runId,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    contentHash: row.contentHash,
    contentUrl:
      row.status === 'ready' ? `/api/transfer-artifacts/${row.id}/content` : null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export async function reserve(
  ctx: PermCtx,
  input: TransferArtifactReserve,
): Promise<TransferArtifactView> {
  const actorId = assertCanManageTransfers(ctx);
  if (input.sizeBytes && input.sizeBytes > env.TRANSFER_MAX_COMPRESSED_BYTES) {
    throw new DomainError('ARCHIVE_TOO_LARGE', 'Archive exceeds configured upload limit');
  }
  const expiresAt = new Date(Date.now() + env.TRANSFER_ARTIFACT_RETENTION_HOURS * 3_600_000);
  const [row] = await db
    .insert(schema.transferArtifacts)
    .values({
      kind: input.kind,
      status: 'uploading',
      createdBy: actorId,
      originalFilename: cleanFilename(input.filename),
      storageKey: randomUUID() + '.zip',
      contentType: 'application/zip',
      expiresAt,
    })
    .returning();
  return toArtifactView(row!);
}

export async function getRow(ctx: PermCtx, id: string): Promise<ArtifactRow> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferArtifacts.findFirst({
    where: eq(schema.transferArtifacts.id, id),
  });
  if (!row || row.status === 'deleted') {
    throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer artifact not found');
  }
  return row;
}

export async function get(ctx: PermCtx, id: string): Promise<TransferArtifactView> {
  return toArtifactView(await getRow(ctx, id));
}

export async function upload(
  ctx: PermCtx,
  id: string,
  source: ReadableStream<Uint8Array>,
  contentType: string | null,
): Promise<TransferArtifactView> {
  const row = await getRow(ctx, id);
  if (row.status !== 'uploading' && row.status !== 'failed') {
    throw new DomainError('ARTIFACT_NOT_UPLOADABLE', 'Artifact is not uploadable');
  }
  if (contentType && !contentType.toLowerCase().startsWith('application/zip')) {
    throw new DomainError('INVALID_ARCHIVE_TYPE', 'Expected application/zip');
  }
  try {
    const stored = await transferArtifactStore.write(
      row.storageKey,
      source,
      env.TRANSFER_MAX_COMPRESSED_BYTES,
    );
    const [updated] = await db
      .update(schema.transferArtifacts)
      .set({
        status: 'ready',
        sizeBytes: stored.sizeBytes,
        contentHash: stored.contentHash,
        readyAt: new Date(),
        errorMessage: null,
      })
      .where(eq(schema.transferArtifacts.id, id))
      .returning();
    return toArtifactView(updated!);
  } catch (error) {
    await db
      .update(schema.transferArtifacts)
      .set({ status: 'failed', errorMessage: 'Upload failed' })
      .where(eq(schema.transferArtifacts.id, id));
    if ((error as { code?: string }).code === 'ARCHIVE_TOO_LARGE') {
      throw new DomainError('ARCHIVE_TOO_LARGE', 'Archive exceeds configured upload limit');
    }
    throw error;
  }
}

export async function remove(ctx: PermCtx, id: string): Promise<void> {
  const row = await getRow(ctx, id);
  const active = await db.query.transferRuns.findFirst({
    where: and(
      or(
        eq(schema.transferRuns.sourceArtifactId, id),
        eq(schema.transferRuns.reportArtifactId, id),
      ),
      inArray(schema.transferRuns.status, ['queued', 'running']),
    ),
  });
  if (active) throw new DomainError('ARTIFACT_IN_USE', 'Artifact is used by an active run');
  await transferArtifactStore.delete(row.storageKey);
  await db
    .update(schema.transferArtifacts)
    .set({ status: 'deleted', deletedAt: new Date() })
    .where(eq(schema.transferArtifacts.id, id));
}
