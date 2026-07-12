import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { persistRevisionMetadata } from '@/server/services/page-metadata';

export type PageMetadataBackfillProgress = {
  scanned: number;
  backfilled: number;
  remaining: number;
};

/**
 * Idempotently creates typed projections for revisions written before this
 * feature.  Each row is re-checked inside its transaction, so reruns and
 * concurrent workers are safe. Call in bounded batches from normal worker
 * startup and report the returned counters to operators.
 */
export async function runPageMetadataBackfill(limit = 100): Promise<PageMetadataBackfillProgress> {
  const candidates = await db
    .select({ revision: schema.pageRevisions, page: schema.pages })
    .from(schema.pageRevisions)
    .innerJoin(schema.pages, eq(schema.pageRevisions.pageId, schema.pages.id))
    .leftJoin(schema.pageRevisionMetadata, eq(schema.pageRevisions.id, schema.pageRevisionMetadata.revisionId))
    .where(and(isNull(schema.pageRevisionMetadata.revisionId), isNull(schema.pages.deletedAt)))
    .limit(limit);
  let backfilled = 0;
  for (const candidate of candidates) {
    const source = await readMarkdownFromDatabase(candidate.revision);
    const wrote = await db.transaction(async (tx) => {
      const existing = await tx.query.pageRevisionMetadata.findFirst({
        where: eq(schema.pageRevisionMetadata.revisionId, candidate.revision.id),
      });
      if (existing) return false;
      await persistRevisionMetadata(tx, {
        revisionId: candidate.revision.id,
        spaceId: candidate.page.spaceId,
        source,
        fallbackTitle: candidate.page.title,
      });
      return true;
    });
    if (wrote) backfilled += 1;
  }
  const remainingRows = await db
    .select({ revisionId: schema.pageRevisions.id })
    .from(schema.pageRevisions)
    .leftJoin(schema.pageRevisionMetadata, eq(schema.pageRevisions.id, schema.pageRevisionMetadata.revisionId))
    .where(isNull(schema.pageRevisionMetadata.revisionId))
    .limit(1);
  return { scanned: candidates.length, backfilled, remaining: remainingRows.length };
}
