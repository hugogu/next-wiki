import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  localBackendConfigSchema,
  s3BackendConfigSchema,
  type BackendCheckInput,
  type BackendCheckResult,
  type StorageBackendUpsert,
  type StorageBackendView,
  type StorageOverview,
  type MigrationView,
  type ReplicaSyncStatus,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { encryptKey } from '@/server/crypto/key-encryption';
import { buildStore, getStoreFor, type StoreSpec } from '@/server/content-store/registry';
import { addBackendBackfillTasks, kickReplication } from './storage-replication';
import { env } from '@/server/config';

type StorageBackendRow = typeof schema.storageBackends.$inferSelect;

/**
 * Until US4 wires the `storage` scope ∩ role check for API keys, only admin
 * session actors may manage storage. Non-admins are treated as if the surface
 * does not exist (hidden denial); callers map a thrown FORBIDDEN/`null` to 404.
 */
export function isStorageAdmin(ctx: PermCtx): boolean {
  // Admin session actor, or an admin-owned API key carrying the `storage` scope
  // (scope ∩ role enforced in can(), FR-024).
  return can(ctx, 'manage_storage', { kind: 'storage' });
}

export function assertCanManageStorage(ctx: PermCtx): void {
  if (!isStorageAdmin(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage storage');
  }
}

function toView(row: StorageBackendRow): StorageBackendView {
  return {
    id: row.id,
    type: row.type,
    purpose: row.purpose,
    isActive: row.isActive,
    replicaState: row.type === 'database' ? 'enabled' : row.replicaState,
    isReadPreferred: row.isReadPreferred,
    syncStartedAt: row.syncStartedAt?.toISOString() ?? null,
    syncCompletedAt: row.syncCompletedAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
    config: (row.config ?? {}) as Record<string, unknown>,
    hasSecret: row.secretEncrypted !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMigrationView(row: typeof schema.contentMigrations.$inferSelect): MigrationView {
  return {
    id: row.id,
    status: row.status,
    abortRequested: row.abortRequested,
    totalItems: row.totalItems,
    copiedItems: row.copiedItems,
    verifiedItems: row.verifiedItems,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function deploymentInfo(): StorageOverview['deployment'] {
  const url = new URL(env.DATABASE_URL);
  const sslMode = url.searchParams.get('sslmode');
  return {
    database: {
      engine: 'PostgreSQL',
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.replace(/^\//, ''),
      username: decodeURIComponent(url.username),
      ssl: sslMode !== null && !['disable', 'false'].includes(sslMode),
    },
    local: {
      containerPath: env.CONTENT_LOCAL_BASE_PATH,
      hostPath: env.CONTENT_LOCAL_HOST_PATH ?? null,
    },
  };
}

/** Storage overview for the admin page. Returns null when the caller is not an admin. */
export async function getOverview(ctx: PermCtx): Promise<StorageOverview | null> {
  if (!isStorageAdmin(ctx)) return null;

  const all = await db.select().from(schema.storageBackends);
  const primaries = all.filter((b) => b.purpose === 'primary');
  const authoritative = primaries.find((b) => b.type === 'database');
  if (!authoritative) {
    // Should not happen once seeded; surface a clear error rather than guessing.
    throw new DomainError('NOT_FOUND', 'No authoritative Database backend is configured');
  }
  const preferredReadBackend = primaries.find((b) => b.isReadPreferred) ?? null;
  const gitExport = all.find((b) => b.purpose === 'git_export') ?? null;

  const [migration] = await db
    .select()
    .from(schema.contentMigrations)
    .where(inArray(schema.contentMigrations.status, ['pending', 'copying', 'verifying']))
    .orderBy(desc(schema.contentMigrations.createdAt))
    .limit(1);

  return {
    active: toView(preferredReadBackend ?? authoritative),
    authoritative: toView(authoritative),
    preferredReadBackend: preferredReadBackend ? toView(preferredReadBackend) : null,
    backends: primaries.map(toView),
    gitExport: gitExport ? toView(gitExport) : null,
    migration: migration ? toMigrationView(migration) : null,
    deployment: deploymentInfo(),
  };
}

/**
 * Create or update a primary backend's configuration (non-secret config plus an
 * optional write-only secret). Does not activate it — activation happens through
 * a migration (US3). Returns the masked view.
 */
export async function upsertBackend(
  ctx: PermCtx,
  input: StorageBackendUpsert,
): Promise<StorageBackendView> {
  assertCanManageStorage(ctx);

  if (
    input.type === 'local' &&
    env.NODE_ENV === 'production' &&
    input.config.basePath !== env.CONTENT_LOCAL_BASE_PATH
  ) {
    throw new DomainError(
      'BAD_REQUEST',
      `Local storage must use the configured Docker mount path ${env.CONTENT_LOCAL_BASE_PATH}`,
    );
  }

  const secretEncrypted =
    input.type === 's3' && input.secret ? encryptKey(input.secret) : undefined;

  const existing = await db.query.storageBackends.findFirst({
    where: and(
      eq(schema.storageBackends.type, input.type),
      eq(schema.storageBackends.purpose, 'primary'),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(schema.storageBackends)
      .set({
        config: input.config,
        // Keep the stored secret if the caller did not supply a new one.
        ...(secretEncrypted ? { secretEncrypted } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.storageBackends.id, existing.id))
      .returning();
    return toView(updated!);
  }

  const [created] = await db
    .insert(schema.storageBackends)
    .values({
      type: input.type,
      purpose: 'primary',
      isActive: false,
      config: input.config,
      secretEncrypted: secretEncrypted ?? null,
    })
    .returning();
  return toView(created!);
}

function buildAdHocStore(input: BackendCheckInput): StoreSpec {
  switch (input.type) {
    case 'database':
      return { type: 'database' };
    case 'local':
      return { type: 'local', config: localBackendConfigSchema.parse(input.config) };
    case 's3':
      if (!input.secret) {
        throw new DomainError('BAD_REQUEST', 'A secret key is required to test an S3 backend');
      }
      return { type: 's3', config: s3BackendConfigSchema.parse(input.config), secret: input.secret };
    default:
      throw new DomainError('BAD_REQUEST', 'Unknown backend type');
  }
}

/**
 * Run an ephemeral connection check against a saved backend or an ad-hoc config,
 * without changing any backend state (FR-015).
 */
export async function checkBackend(
  ctx: PermCtx,
  input: BackendCheckInput,
): Promise<BackendCheckResult> {
  assertCanManageStorage(ctx);

  let store;
  if (input.backendId) {
    const row = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, input.backendId),
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Backend not found');
    store = getStoreFor({
      ...row,
      config: input.config ?? row.config,
      secretEncrypted: input.secret ? encryptKey(input.secret) : row.secretEncrypted,
    });
  } else {
    store = buildStore(buildAdHocStore(input));
  }

  try {
    return await store.healthCheck();
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function enableBackend(
  ctx: PermCtx,
  backendId: string,
  syncExisting: boolean,
): Promise<StorageBackendView> {
  assertCanManageStorage(ctx);
  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, backendId),
  });
  if (!backend) throw new DomainError('NOT_FOUND', 'Backend not found');
  if (backend.type === 'database') return toView(backend);

  const health = await getStoreFor(backend).healthCheck();
  if (!health.ok) {
    throw new DomainError('BAD_REQUEST', health.detail ?? 'Backend health check failed');
  }

  const updated = await db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(schema.storageBackends)
      .set({
        isActive: false,
        replicaState: syncExisting ? 'backfilling' : 'enabled',
        syncStartedAt: syncExisting ? now : null,
        syncCompletedAt: syncExisting ? null : now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(schema.storageBackends.id, backendId))
      .returning();
    await tx
      .delete(schema.storageReplicationTasks)
      .where(eq(schema.storageReplicationTasks.backendId, backendId));
    if (!syncExisting) return row!;

    await addBackendBackfillTasks(tx, backendId);
    const pending = await tx
      .select({ id: schema.storageReplicationTasks.id })
      .from(schema.storageReplicationTasks)
      .where(
        and(
          eq(schema.storageReplicationTasks.backendId, backendId),
          inArray(schema.storageReplicationTasks.status, ['pending', 'running', 'failed']),
        ),
      )
      .limit(1);
    if (pending.length === 0) {
      const [enabled] = await tx
        .update(schema.storageBackends)
        .set({
          replicaState: 'enabled',
          syncCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.storageBackends.id, backendId))
        .returning();
      return enabled!;
    }
    return row!;
  });
  if (syncExisting) await kickReplication();
  return toView(updated);
}

export async function getReplicaSyncStatus(
  ctx: PermCtx,
  backendId: string,
): Promise<ReplicaSyncStatus> {
  assertCanManageStorage(ctx);
  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, backendId),
  });
  if (!backend || backend.type === 'database' || backend.type === 'git') {
    throw new DomainError('NOT_FOUND', 'Replica backend not found');
  }

  const rows = await db
    .select({
      status: schema.storageReplicationTasks.status,
      value: count(),
    })
    .from(schema.storageReplicationTasks)
    .where(eq(schema.storageReplicationTasks.backendId, backendId))
    .groupBy(schema.storageReplicationTasks.status);
  const counts = new Map(rows.map((row) => [row.status, Number(row.value)]));

  return {
    backendId,
    backendType: backend.type,
    state: backend.replicaState,
    totalItems: rows.reduce((sum, row) => sum + Number(row.value), 0),
    completedItems: counts.get('completed') ?? 0,
    failedItems: counts.get('failed') ?? 0,
    lastError: backend.lastError,
  };
}

export async function disableBackend(
  ctx: PermCtx,
  backendId: string,
  deleteData = false,
): Promise<StorageBackendView> {
  assertCanManageStorage(ctx);
  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, backendId),
  });
  if (!backend) throw new DomainError('NOT_FOUND', 'Backend not found');
  if (backend.type === 'database') {
    throw new DomainError('BAD_REQUEST', 'The authoritative Database backend cannot be disabled');
  }
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.storageBackends)
      .set({
        isActive: false,
        isReadPreferred: false,
        replicaState: deleteData ? 'deleting' : 'disabled',
        updatedAt: new Date(),
      })
      .where(eq(schema.storageBackends.id, backendId))
      .returning();
    await tx
      .update(schema.storageReplicationTasks)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.storageReplicationTasks.backendId, backendId),
          inArray(schema.storageReplicationTasks.status, ['pending', 'running', 'failed']),
        ),
      );
    return row!;
  });
  return toView(updated);
}

export async function setPreferredReadBackend(
  ctx: PermCtx,
  backendId: string | null,
): Promise<StorageBackendView | null> {
  assertCanManageStorage(ctx);
  return db.transaction(async (tx) => {
    await tx
      .update(schema.storageBackends)
      .set({ isReadPreferred: false, updatedAt: new Date() })
      .where(eq(schema.storageBackends.isReadPreferred, true));
    if (backendId === null) return null;

    const backend = await tx.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, backendId),
    });
    if (
      !backend ||
      backend.type === 'database' ||
      !['enabled', 'degraded'].includes(backend.replicaState)
    ) {
      throw new DomainError('BAD_REQUEST', 'Preferred read backend must be an enabled replica');
    }
    const [updated] = await tx
      .update(schema.storageBackends)
      .set({ isReadPreferred: true, updatedAt: new Date() })
      .where(eq(schema.storageBackends.id, backendId))
      .returning();
    return toView(updated!);
  });
}
