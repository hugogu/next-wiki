import { and, eq } from 'drizzle-orm';
import {
  localBackendConfigSchema,
  s3BackendConfigSchema,
  type LocalBackendConfig,
  type S3BackendConfig,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { decryptKey } from '@/server/crypto/key-encryption';
import { DatabaseStore } from './database-store';
import { LocalStore } from './local-store';
import { S3Store } from './s3-store';
import { BackendUnavailableError, type ContentStore } from './types';

type StorageBackendRow = typeof schema.storageBackends.$inferSelect;

/** Backend descriptor with already-decrypted, validated config. */
export type StoreSpec =
  | { type: 'database' }
  | { type: 'local'; config: LocalBackendConfig }
  | { type: 's3'; config: S3BackendConfig; secret: string };

/**
 * Construct a ContentStore from a validated spec. Implementations are imported
 * and constructed explicitly here — no filesystem or dynamic discovery (P9).
 */
export function buildStore(spec: StoreSpec): ContentStore {
  switch (spec.type) {
    case 'database':
      return new DatabaseStore();
    case 'local':
      return new LocalStore(spec.config.basePath);
    case 's3':
      return new S3Store({ ...spec.config, secretAccessKey: spec.secret });
  }
}

/** Build the store for a stored backend row, decrypting its secret as needed. */
export function getStoreFor(backend: StorageBackendRow): ContentStore {
  switch (backend.type) {
    case 'database':
      return buildStore({ type: 'database' });
    case 'local':
      return buildStore({ type: 'local', config: localBackendConfigSchema.parse(backend.config) });
    case 's3': {
      if (!backend.secretEncrypted) {
        throw new BackendUnavailableError('s3', 'S3 backend is missing its secret key');
      }
      return buildStore({
        type: 's3',
        config: s3BackendConfigSchema.parse(backend.config),
        secret: decryptKey(backend.secretEncrypted),
      });
    }
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

/** Preferred replica for reads; Database is the permanent fallback/default. */
export async function getPreferredReadStore(): Promise<ContentStore> {
  const preferred = await getPreferredReadBackend();
  if (!preferred) return new DatabaseStore();
  try {
    return getStoreFor(preferred);
  } catch {
    return new DatabaseStore();
  }
}

export async function getPreferredReadBackend(): Promise<StorageBackendRow | null> {
  const preferred = await db.query.storageBackends.findFirst({
    where: and(
      eq(schema.storageBackends.purpose, 'primary'),
      eq(schema.storageBackends.isReadPreferred, true),
    ),
  });
  if (!preferred || !['enabled', 'degraded'].includes(preferred.replicaState)) {
    return null;
  }
  return preferred;
}
