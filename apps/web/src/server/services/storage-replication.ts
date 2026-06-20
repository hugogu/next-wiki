import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { enqueue } from '@/server/jobs/runtime';
import { QUEUES } from '@/server/jobs/runtime';
import type { DbExecutor } from '@/server/content-store/database-store';

type ObjectKind = 'markdown' | 'image';

export async function addReplicationTasks(
  exec: DbExecutor,
  objectKind: ObjectKind,
  objectId: string,
  expectedHash: string,
): Promise<void> {
  const replicas = await exec
    .select({ id: schema.storageBackends.id })
    .from(schema.storageBackends)
    .where(
      and(
        ne(schema.storageBackends.type, 'database'),
        eq(schema.storageBackends.purpose, 'primary'),
        inArray(schema.storageBackends.replicaState, ['backfilling', 'enabled', 'degraded']),
      ),
    );
  if (replicas.length === 0) return;

  await exec
    .insert(schema.storageReplicationTasks)
    .values(
      replicas.map((backend) => ({
        backendId: backend.id,
        objectKind,
        objectId,
        operation: 'upsert' as const,
        expectedHash,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.storageReplicationTasks.backendId,
        schema.storageReplicationTasks.objectKind,
        schema.storageReplicationTasks.objectId,
        schema.storageReplicationTasks.operation,
      ],
      set: {
        expectedHash,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });
}

export async function addBackendBackfillTasks(
  exec: DbExecutor,
  backendId: string,
): Promise<void> {
  const revisions = await exec
    .select({ id: schema.pageRevisions.id, hash: schema.pageRevisions.contentHash })
    .from(schema.pageRevisions)
    .where(sql`${schema.pageRevisions.contentSource} is not null`);
  const assets = await exec
    .select({ id: schema.contentAssets.id, hash: schema.contentAssets.contentHash })
    .from(schema.contentAssets)
    .where(sql`${schema.contentAssets.deletedAt} is null`);

  const values = [
    ...revisions.map((item) => ({
      backendId,
      objectKind: 'markdown' as const,
      objectId: item.id,
      operation: 'upsert' as const,
      expectedHash: item.hash,
    })),
    ...assets.map((item) => ({
      backendId,
      objectKind: 'image' as const,
      objectId: item.id,
      operation: 'upsert' as const,
      expectedHash: item.hash,
    })),
  ];
  if (values.length === 0) return;

  await exec
    .insert(schema.storageReplicationTasks)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.storageReplicationTasks.backendId,
        schema.storageReplicationTasks.objectKind,
        schema.storageReplicationTasks.objectId,
        schema.storageReplicationTasks.operation,
      ],
      set: {
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });
}

export async function kickReplication(): Promise<void> {
  await enqueue(QUEUES.replication, {});
}

export async function addBackendRepairTask(
  backendId: string,
  objectKind: ObjectKind,
  objectId: string,
  expectedHash: string,
): Promise<void> {
  await db
    .insert(schema.storageReplicationTasks)
    .values({ backendId, objectKind, objectId, operation: 'upsert', expectedHash })
    .onConflictDoUpdate({
      target: [
        schema.storageReplicationTasks.backendId,
        schema.storageReplicationTasks.objectKind,
        schema.storageReplicationTasks.objectId,
        schema.storageReplicationTasks.operation,
      ],
      set: {
        expectedHash,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });
  await kickReplication();
}
