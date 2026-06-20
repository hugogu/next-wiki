import { and, eq, inArray, or } from 'drizzle-orm';
import type { CleanupJobView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertCanManageStorage } from '@/server/services/storage-config';

type CleanupRow = typeof schema.storageCleanupJobs.$inferSelect;

export function toCleanupView(row: CleanupRow): CleanupJobView {
  return {
    jobId: row.id,
    backendId: row.backendId,
    status: row.status,
    totalItems: row.totalItems,
    deletedItems: row.deletedItems,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Start a confirmed cleanup of a retained, inactive backend. Refuses the active
 * backend and any backend participating in an active migration (FR-021).
 */
export async function startCleanup(
  ctx: PermCtx,
  input: { backendId: string; confirm: true },
): Promise<CleanupJobView> {
  assertCanManageStorage(ctx);
  const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to start cleanup');

  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, input.backendId),
  });
  if (!backend) throw new DomainError('NOT_FOUND', 'Backend not found');
  if (backend.isActive) {
    throw new DomainError('CONFLICT', 'Cannot clean up the active backend');
  }

  const inMigration = await db.query.contentMigrations.findFirst({
    where: and(
      inArray(schema.contentMigrations.status, ['pending', 'copying', 'verifying']),
      or(
        eq(schema.contentMigrations.sourceBackendId, backend.id),
        eq(schema.contentMigrations.targetBackendId, backend.id),
      ),
    ),
  });
  if (inMigration) {
    throw new DomainError('CONFLICT', 'Backend participates in an active migration');
  }

  const [created] = await db
    .insert(schema.storageCleanupJobs)
    .values({ backendId: backend.id, status: 'pending', createdBy: userId })
    .returning();
  return toCleanupView(created!);
}

export async function getCleanupJob(ctx: PermCtx, jobId: string): Promise<CleanupJobView | null> {
  assertCanManageStorage(ctx);
  const row = await db.query.storageCleanupJobs.findFirst({
    where: eq(schema.storageCleanupJobs.id, jobId),
  });
  return row ? toCleanupView(row) : null;
}
