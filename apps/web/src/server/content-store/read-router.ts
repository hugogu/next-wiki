import { createHash } from 'node:crypto';
import { DatabaseStore } from './database-store';
import { getPreferredReadBackend, getStoreFor } from './registry';
import { addBackendRepairTask } from '@/server/services/storage-replication';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function readMarkdownWithFallback(revision: {
  id: string;
  contentSource: string | null;
  contentHash: string;
}): Promise<string> {
  const preferred = await getPreferredReadBackend();
  if (preferred) {
    try {
      const source = await getStoreFor(preferred).getMarkdown(revision.id);
      if (sha256(source) === revision.contentHash) return source;
    } catch {
      // Database fallback below.
    }
    await addBackendRepairTask(preferred.id, 'markdown', revision.id, revision.contentHash);
  }
  if (revision.contentSource !== null) return revision.contentSource;
  return new DatabaseStore().getMarkdown(revision.id);
}

/**
 * Read markdown straight from the authoritative database, bypassing the
 * preferred read backend. Used for editing: the source is small and always
 * present in the database, so it is not worth blocking the page on a remote
 * replica (e.g. S3) read.
 */
export async function readMarkdownFromDatabase(revision: {
  id: string;
  contentSource: string | null;
}): Promise<string> {
  if (revision.contentSource !== null) return revision.contentSource;
  return new DatabaseStore().getMarkdown(revision.id);
}

export async function readImageWithFallback(asset: {
  id: string;
  contentHash: string;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const preferred = await getPreferredReadBackend();
  if (preferred) {
    try {
      const image = await getStoreFor(preferred).getImage(asset.id);
      if (sha256(image.bytes) === asset.contentHash) return image;
    } catch {
      // Database fallback below.
    }
    await addBackendRepairTask(preferred.id, 'image', asset.id, asset.contentHash);
  }
  return new DatabaseStore().getImage(asset.id);
}

/**
 * Read an image straight from the authoritative database, bypassing the
 * preferred read backend. The counterpart to {@link readMarkdownFromDatabase}
 * for callers (e.g. Git export) that reconcile the whole published snapshot and
 * must not stall — or generate repair tasks — on a slow or unreachable replica.
 */
export async function readImageFromDatabase(asset: {
  id: string;
}): Promise<{ bytes: Buffer; contentType: string }> {
  return new DatabaseStore().getImage(asset.id);
}
