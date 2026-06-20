import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DatabaseStore } from './database-store';
import { BackendUnavailableError, type ContentStore } from './types';

type StorageBackendRow = typeof schema.storageBackends.$inferSelect;

/**
 * Construct the ContentStore for a configured backend row. Implementations are
 * imported and constructed explicitly here — no filesystem or dynamic
 * discovery (constitution P9). Local/S3 stores are registered in US2.
 */
export function getStoreFor(backend: StorageBackendRow): ContentStore {
  switch (backend.type) {
    case 'database':
      return new DatabaseStore();
    case 'local':
    case 's3':
      throw new BackendUnavailableError(
        'database',
        `Backend type "${backend.type}" is not registered yet`,
      );
    default:
      throw new BackendUnavailableError('database', `Unknown backend type "${backend.type}"`);
  }
}

/**
 * Resolve the active authoritative content store from the active primary
 * `storage_backends` row. Falls back to the Database backend when no row exists
 * yet (zero-configuration default, P1).
 */
export async function getActiveStore(): Promise<ContentStore> {
  const active = await db.query.storageBackends.findFirst({
    where: and(
      eq(schema.storageBackends.purpose, 'primary'),
      eq(schema.storageBackends.isActive, true),
    ),
  });
  if (!active) return new DatabaseStore();
  return getStoreFor(active);
}
