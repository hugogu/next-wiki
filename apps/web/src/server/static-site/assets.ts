import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readImageFromDatabase } from '@/server/content-store/read-router';
import type { PublishableSet } from './eligibility';
import { extensionForContentType } from './links';

/**
 * Export the assets referenced by publishable pages.
 *
 * The set of asset ids comes from the eligibility query, which scoped them to
 * the published revisions of publishable pages — so an image used only by a
 * restricted page is never read, never written, and never appears in the
 * artifact (FR-010).
 */

export type ExportedAssets = {
  /** asset id → file extension, for rewriting references in page HTML. */
  extensions: Map<string, string>;
  count: number;
  bytes: number;
};

export async function exportAssets(
  set: PublishableSet,
  rootDir: string,
): Promise<ExportedAssets> {
  const extensions = new Map<string, string>();
  if (set.assetIds.size === 0) return { extensions, count: 0, bytes: 0 };

  const rows = await db
    .select({ id: schema.contentAssets.id, contentType: schema.contentAssets.contentType })
    .from(schema.contentAssets)
    .where(inArray(schema.contentAssets.id, [...set.assetIds]));

  let bytes = 0;
  for (const row of rows) {
    const extension = extensionForContentType(row.contentType);
    // Read straight from the authoritative database rather than a read-preferred
    // replica: a publish must not stall on, or queue repair work against, a slow
    // remote backend, and the published bytes always exist in the DB.
    const { bytes: data } = await readImageFromDatabase({ id: row.id });
    const filePath = join(rootDir, '_assets', `${row.id}${extension}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    extensions.set(row.id, extension);
    bytes += data.byteLength;
  }

  return { extensions, count: rows.length, bytes };
}
