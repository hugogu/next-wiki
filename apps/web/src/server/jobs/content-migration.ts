import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getStoreFor } from '@/server/content-store/registry';
import type { ContentStore } from '@/server/content-store/types';
import { logger } from '@/server/logger';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const k of iter) out.push(k);
  return out;
}

async function isAbortRequested(migrationId: string): Promise<boolean> {
  const row = await db.query.contentMigrations.findFirst({
    where: eq(schema.contentMigrations.id, migrationId),
  });
  return row?.abortRequested ?? true;
}

async function markAborted(migrationId: string): Promise<void> {
  await db
    .update(schema.contentMigrations)
    .set({ status: 'aborted', finishedAt: new Date() })
    .where(eq(schema.contentMigrations.id, migrationId));
}

async function markFailed(migrationId: string, message: string): Promise<void> {
  await db
    .update(schema.contentMigrations)
    .set({ status: 'failed', errorMessage: message, finishedAt: new Date() })
    .where(eq(schema.contentMigrations.id, migrationId));
}

/**
 * Migration worker: copy → verify → guarded cutover (plan D6 / research R5).
 * Idempotent and resumable — content-addressed writes make re-runs safe, and a
 * conditional cutover transaction closes the abort-vs-cutover race. Never throws;
 * failures are recorded on the migration row and all data is retained.
 */
export async function runMigration(migrationId: string): Promise<void> {
  const migration = await db.query.contentMigrations.findFirst({
    where: eq(schema.contentMigrations.id, migrationId),
  });
  if (!migration) return;
  if (!['pending', 'copying', 'verifying'].includes(migration.status)) return;

  const source = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, migration.sourceBackendId),
  });
  const target = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, migration.targetBackendId),
  });
  if (!source || !target) {
    await markFailed(migrationId, 'Source or target backend no longer exists');
    return;
  }

  const sourceStore = getStoreFor(source);
  const targetStore = getStoreFor(target);

  try {
    if (await isAbortRequested(migrationId)) return markAborted(migrationId);

    await db
      .update(schema.contentMigrations)
      .set({ status: 'copying', startedAt: migration.startedAt ?? new Date(), copiedItems: 0, verifiedItems: 0 })
      .where(eq(schema.contentMigrations.id, migrationId));

    const mdKeys = await collect(sourceStore.listMarkdownKeys());
    const imgKeys = await collect(sourceStore.listImageKeys());
    const total = mdKeys.length + imgKeys.length;
    await db
      .update(schema.contentMigrations)
      .set({ totalItems: total })
      .where(eq(schema.contentMigrations.id, migrationId));

    const copied = await copyAll(migrationId, sourceStore, targetStore, mdKeys, imgKeys);
    if (copied === null) return markAborted(migrationId);

    if (await isAbortRequested(migrationId)) return markAborted(migrationId);
    await db
      .update(schema.contentMigrations)
      .set({ status: 'verifying' })
      .where(eq(schema.contentMigrations.id, migrationId));

    const verifyError = await verifyAll(migrationId, targetStore, mdKeys, imgKeys);
    if (verifyError) return markFailed(migrationId, verifyError);

    if (await isAbortRequested(migrationId)) return markAborted(migrationId);
    await cutover(migrationId, source.id, target.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('content-migration failed', { migrationId, error: message });
    await markFailed(migrationId, message);
  }
}

async function copyAll(
  migrationId: string,
  sourceStore: ContentStore,
  targetStore: ContentStore,
  mdKeys: string[],
  imgKeys: string[],
): Promise<number | null> {
  let copied = 0;
  for (const key of mdKeys) {
    if (await isAbortRequested(migrationId)) return null;
    const source = await sourceStore.getMarkdown(key);
    await targetStore.putMarkdown(key, source);
    copied += 1;
    await db
      .update(schema.contentMigrations)
      .set({ copiedItems: copied })
      .where(eq(schema.contentMigrations.id, migrationId));
  }
  for (const key of imgKeys) {
    if (await isAbortRequested(migrationId)) return null;
    const { bytes, contentType } = await sourceStore.getImage(key);
    await targetStore.putImage(key, bytes, contentType);
    copied += 1;
    await db
      .update(schema.contentMigrations)
      .set({ copiedItems: copied })
      .where(eq(schema.contentMigrations.id, migrationId));
  }
  return copied;
}

async function verifyAll(
  migrationId: string,
  targetStore: ContentStore,
  mdKeys: string[],
  imgKeys: string[],
): Promise<string | null> {
  let verified = 0;
  for (const key of mdKeys) {
    const [rev] = await db
      .select({ hash: schema.pageRevisions.contentHash })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.id, key));
    if (!rev) continue;
    const copied = await targetStore.getMarkdown(key);
    if (sha256(copied) !== rev.hash) {
      return `Markdown fingerprint mismatch for revision ${key}`;
    }
    verified += 1;
    await db
      .update(schema.contentMigrations)
      .set({ verifiedItems: verified })
      .where(eq(schema.contentMigrations.id, migrationId));
  }
  for (const key of imgKeys) {
    const [asset] = await db
      .select({ hash: schema.contentAssets.contentHash })
      .from(schema.contentAssets)
      .where(eq(schema.contentAssets.id, key));
    if (!asset) continue;
    const { bytes } = await targetStore.getImage(key);
    if (sha256(bytes) !== asset.hash) {
      return `Image fingerprint mismatch for asset ${key}`;
    }
    verified += 1;
    await db
      .update(schema.contentMigrations)
      .set({ verifiedItems: verified })
      .where(eq(schema.contentMigrations.id, migrationId));
  }
  return null;
}

/**
 * Conditional cutover: only flips the active backend if the migration is still
 * verifying and no abort landed. The guarded UPDATE affecting zero rows means an
 * abort won the race, so the original backend stays active (data-model / FR-018a).
 */
async function cutover(migrationId: string, sourceId: string, targetId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const guarded = await tx
      .update(schema.contentMigrations)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(
        and(
          eq(schema.contentMigrations.id, migrationId),
          eq(schema.contentMigrations.status, 'verifying'),
          eq(schema.contentMigrations.abortRequested, false),
        ),
      )
      .returning({ id: schema.contentMigrations.id });

    if (guarded.length === 0) {
      await tx
        .update(schema.contentMigrations)
        .set({ status: 'aborted', finishedAt: new Date() })
        .where(eq(schema.contentMigrations.id, migrationId));
      return;
    }

    // Deactivate source before activating target so the single-active-primary
    // index never sees two active rows mid-transaction.
    await tx
      .update(schema.storageBackends)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.storageBackends.id, sourceId));
    await tx
      .update(schema.storageBackends)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(schema.storageBackends.id, targetId));
  });
}
