import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { captureFullSnapshot, captureGeneratedSnapshot } from '@/server/services/transfer-export';
import { writePortableArchive } from '@/server/transfers/archive-writer';
import { writeOkfArchive } from '@/server/transfers/okf-archive-writer';
import { markRunTerminal } from '@/server/services/transfers';
import { logger } from '@/server/logger';

export async function runTransferExport(runId: string): Promise<void> {
  const run = await db.query.transferRuns.findFirst({
    where: eq(schema.transferRuns.id, runId),
  });
  if (!run || run.kind !== 'site_export') return;
  if (run.cancelRequested) {
    await markRunTerminal(runId, 'cancelled');
    return;
  }
  await db
    .update(schema.transferRuns)
    .set({ status: 'running', phase: 'discovering', startedAt: run.startedAt ?? new Date() })
    .where(eq(schema.transferRuns.id, runId));

  const artifactId = randomUUID();
  const storageKey = `${artifactId}.zip`;
  const options = run.options as { space?: unknown; format?: unknown };
  const isGeneratedOkfExport = options.space === 'generated' && options.format === 'okf';
  try {
    const snapshot = isGeneratedOkfExport
      ? await captureGeneratedSnapshot()
      : await captureFullSnapshot();

    // Each ExportPage carries its own spaceKind/spaceSlug so the writer can
    // dispatch frontmatter / contentType per page without a single space hint.
    const pages = snapshot.pages;

    await db
      .update(schema.transferRuns)
      .set({
        phase: 'finalizing',
        totalItems: snapshot.pages.length + snapshot.assets.length,
        currentItem: isGeneratedOkfExport ? 'Creating OKF archive' : 'Creating portable archive',
      })
      .where(eq(schema.transferRuns.id, runId));
    await db.insert(schema.transferArtifacts).values({
      id: artifactId,
      kind: 'export_archive',
      status: 'uploading',
      createdBy: run.actorUserId,
      runId,
      originalFilename: `${isGeneratedOkfExport ? 'next-wiki-okf-export' : 'next-wiki-export'}-${new Date().toISOString().slice(0, 10)}.zip`,
      storageKey,
      contentType: 'application/zip',
      expiresAt: new Date(Date.now() + env.TRANSFER_ARTIFACT_RETENTION_HOURS * 3_600_000),
    });
    const { stored } = isGeneratedOkfExport
      ? await writeOkfArchive({
          storageKey,
          capturedAt: snapshot.capturedAt,
          pages: snapshot.pages,
          assets: snapshot.assets,
        })
      : await writePortableArchive({
          storageKey,
          instanceId: snapshot.instanceId,
          productVersion: process.env.npm_package_version ?? '0.1.0',
          capturedAt: snapshot.capturedAt,
          pages,
          assets: snapshot.assets,
        });
    await db
      .update(schema.transferArtifacts)
      .set({
        status: 'ready',
        sizeBytes: stored.sizeBytes,
        contentHash: stored.contentHash,
        readyAt: new Date(),
      })
      .where(eq(schema.transferArtifacts.id, artifactId));
    await markRunTerminal(runId, 'completed', {
      reportArtifactId: artifactId,
      processedItems: snapshot.pages.length + snapshot.assets.length,
      createdItems: snapshot.pages.length + snapshot.assets.length,
    });
  } catch (error) {
    logger.error('transfer export failed', { runId, error });
    await db
      .update(schema.transferArtifacts)
      .set({ status: 'failed', errorMessage: 'Export failed' })
      .where(eq(schema.transferArtifacts.id, artifactId));
    await markRunTerminal(runId, 'failed', {
      errorCode: 'EXPORT_FAILED',
      errorMessage: isGeneratedOkfExport ? 'OKF archive export failed' : 'Portable archive export failed',
      errorDetail: error instanceof Error ? error.message.slice(0, 500) : null,
    });
  }
}
