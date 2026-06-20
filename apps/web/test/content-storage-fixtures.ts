import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

/**
 * Truncate every content/storage table in one FK-safe statement. Storage suites
 * call this in beforeAll/afterAll so they are isolated from each other
 * regardless of file execution order.
 */
export async function truncateStorageTables(): Promise<void> {
  await db.execute(
    sql.raw(
      'TRUNCATE TABLE storage_cleanup_jobs, content_asset_refs, content_blobs, content_assets, content_migrations, storage_backends, page_revisions, pages, sessions, users, spaces RESTART IDENTITY CASCADE',
    ),
  );
}

/**
 * Reusable fixtures for the content-storage suites: valid raster image bytes for
 * each allowlisted type, a known-bad payload, and a temporary-directory helper
 * for filesystem-backed store tests (Local backend, US2).
 */

export const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
export const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
export const gifBytes = Buffer.from([...Buffer.from('GIF89a'), 0, 0, 0, 0]);
export const webpBytes = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.from([0, 0]),
]);
export const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

export const imageFixtures: Record<string, Buffer> = {
  'image/png': pngBytes,
  'image/jpeg': jpegBytes,
  'image/gif': gifBytes,
  'image/webp': webpBytes,
};

/** Create a throwaway directory and a disposer that removes it recursively. */
export async function withTempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'next-wiki-store-'));
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
