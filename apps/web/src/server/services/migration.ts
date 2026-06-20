import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { MigrationView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { getStoreFor } from '@/server/content-store/registry';
import { type ContentStore } from '@/server/content-store/types';
import { assertCanManageStorage } from '@/server/services/storage-config';

const ACTIVE_STATES = ['pending', 'copying', 'verifying'] as const;

// Stable key for the advisory lock that serializes migration starts.
const MIGRATION_LOCK_KEY = 0x6d_69_67_72; // "migr"

type MigrationRow = typeof schema.contentMigrations.$inferSelect;

export function toMigrationView(row: MigrationRow): MigrationView {
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

/** True while a migration holds the global write lock (FR-019). */
export async function isMigrationActive(): Promise<boolean> {
  const row = await db.query.contentMigrations.findFirst({
    where: inArray(schema.contentMigrations.status, [...ACTIVE_STATES]),
  });
  return Boolean(row);
}

export async function assertNotMigrating(): Promise<void> {
  if (await isMigrationActive()) {
    throw new DomainError('STORAGE_MIGRATING', 'Content storage is migrating; writes are paused');
  }
}

async function iterableHasItem(iter: AsyncIterable<string>): Promise<boolean> {
  const it = iter[Symbol.asyncIterator]();
  const first = await it.next();
  await it.return?.();
  return !first.done;
}

async function storeHasContent(store: ContentStore): Promise<boolean> {
  return (
    (await iterableHasItem(store.listMarkdownKeys())) ||
    (await iterableHasItem(store.listImageKeys()))
  );
}

/**
 * Start a backend switch. Validates the target, takes the single-flight write
 * lock, creates the pending migration row (which itself acts as the lock), and
 * returns its id. The caller enqueues the worker (P6). Lock acquisition and the
 * single-flight check happen in one transaction guarded by an advisory lock, so
 * no write can slip between acceptance and worker start (plan D6).
 */
export async function startMigration(
  ctx: PermCtx,
  input: { targetBackendId: string; confirmOverwrite?: boolean },
): Promise<{ id: string }> {
  assertCanManageStorage(ctx);
  const userId = getActorUserId(ctx);
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to start a migration');

  const target = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, input.targetBackendId),
  });
  if (!target || target.purpose !== 'primary') {
    throw new DomainError('BAD_REQUEST', 'Target backend is not a configured primary backend');
  }

  const source = await db.query.storageBackends.findFirst({
    where: and(
      eq(schema.storageBackends.purpose, 'primary'),
      eq(schema.storageBackends.isActive, true),
    ),
  });
  if (!source) throw new DomainError('NOT_FOUND', 'No active storage backend');
  if (source.id === target.id) {
    throw new DomainError('BAD_REQUEST', 'Target backend is already active');
  }

  const targetStore = getStoreFor(target);
  const health = await targetStore.healthCheck();
  if (!health.ok) {
    throw new DomainError('BAD_REQUEST', `Target backend is not healthy: ${health.detail ?? ''}`);
  }

  if ((await storeHasContent(targetStore)) && !input.confirmOverwrite) {
    throw new DomainError('CONFLICT', 'Target backend already contains data');
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);

    const existing = await tx.query.contentMigrations.findFirst({
      where: inArray(schema.contentMigrations.status, [...ACTIVE_STATES]),
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'A migration is already in progress');
    }

    const [created] = await tx
      .insert(schema.contentMigrations)
      .values({
        sourceBackendId: source.id,
        targetBackendId: target.id,
        status: 'pending',
        createdBy: userId,
      })
      .returning({ id: schema.contentMigrations.id });
    return { id: created!.id };
  });
}

export async function getMigration(ctx: PermCtx, id: string): Promise<MigrationView | null> {
  assertCanManageStorage(ctx);
  const row = await db.query.contentMigrations.findFirst({
    where: eq(schema.contentMigrations.id, id),
  });
  return row ? toMigrationView(row) : null;
}

export async function listMigrations(ctx: PermCtx, limit = 20): Promise<MigrationView[]> {
  assertCanManageStorage(ctx);
  const rows = await db
    .select()
    .from(schema.contentMigrations)
    .orderBy(desc(schema.contentMigrations.createdAt))
    .limit(limit);
  return rows.map(toMigrationView);
}

/**
 * Request a cooperative abort. Only sets `abort_requested`; the worker
 * transitions to `aborted` at its next checkpoint and a guarded cutover prevents
 * activation after the request (FR-018a).
 */
export async function requestAbort(ctx: PermCtx, id: string): Promise<MigrationView> {
  assertCanManageStorage(ctx);
  const row = await db.query.contentMigrations.findFirst({
    where: eq(schema.contentMigrations.id, id),
  });
  if (!row) throw new DomainError('NOT_FOUND', 'Migration not found');
  if (!ACTIVE_STATES.includes(row.status as (typeof ACTIVE_STATES)[number])) {
    throw new DomainError('CONFLICT', 'Migration is not abortable');
  }
  const [updated] = await db
    .update(schema.contentMigrations)
    .set({ abortRequested: true })
    .where(eq(schema.contentMigrations.id, id))
    .returning();
  return toMigrationView(updated!);
}

/**
 * Ids of migrations that should be (re-)queued on boot: those interrupted by a
 * crash (`copying`/`verifying`) and any `pending` ones whose enqueue may have
 * been missed. Re-running is idempotent (content-addressed writes, FR-022).
 */
export async function findInterruptedMigrationIds(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.contentMigrations.id })
    .from(schema.contentMigrations)
    .where(inArray(schema.contentMigrations.status, ['pending', 'copying', 'verifying']));
  return rows.map((r) => r.id);
}
