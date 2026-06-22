import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  gitBackendConfigSchema,
  type GitExportUpsert,
  type GitSshKeyResult,
  type StorageBackendView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { encryptKey } from '@/server/crypto/key-encryption';
import { assertCanManageStorage } from './storage-config';
import type { PermCtx } from '@/server/permissions';
import { enqueue } from '@/server/jobs/runtime';
import { QUEUES } from '@/server/jobs/runtime';

const execFileAsync = promisify(execFile);

type StorageBackendRow = typeof schema.storageBackends.$inferSelect;

function toView(row: StorageBackendRow): StorageBackendView {
  return {
    id: row.id,
    type: row.type,
    purpose: row.purpose,
    isActive: row.isActive,
    replicaState: row.replicaState,
    isReadPreferred: false,
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

async function findGitExport(): Promise<StorageBackendRow | undefined> {
  return db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.purpose, 'git_export'),
  });
}

/** Masked view of the Git sync backend for the admin UI, or null when unconfigured. */
export async function getGitExport(ctx: PermCtx): Promise<StorageBackendView | null> {
  assertCanManageStorage(ctx);
  const existing = await findGitExport();
  return existing ? toView(existing) : null;
}

export async function configureGitExport(
  ctx: PermCtx,
  input: GitExportUpsert,
): Promise<StorageBackendView> {
  assertCanManageStorage(ctx);
  const config = gitBackendConfigSchema.parse(input.config);
  const existing = await findGitExport();
  const existingConfig = existing
    ? gitBackendConfigSchema.safeParse(existing.config)
    : null;
  const hasCompatibleStoredSecret =
    Boolean(existing?.secretEncrypted) &&
    existingConfig?.success === true &&
    existingConfig.data.authMode === config.authMode;

  if (
    input.enabled &&
    config.authMode === 'https_token' &&
    !input.secret &&
    !hasCompatibleStoredSecret
  ) {
    throw new DomainError('BAD_REQUEST', 'An HTTPS access token is required');
  }
  if (
    input.enabled &&
    config.authMode === 'ssh' &&
    (!config.publicKey || !hasCompatibleStoredSecret)
  ) {
    throw new DomainError('BAD_REQUEST', 'Generate an SSH key before enabling SSH authentication');
  }

  const secretUpdate = input.secret
    ? { secretEncrypted: encryptKey(input.secret) }
    : existing && existingConfig?.success && existingConfig.data.authMode !== config.authMode
      ? { secretEncrypted: null }
      : {};
  const values = {
    type: 'git' as const,
    purpose: 'git_export' as const,
    isActive: input.enabled,
    replicaState: input.enabled ? ('backfilling' as const) : ('disabled' as const),
    config,
    ...secretUpdate,
    lastError: null,
    syncStartedAt: input.enabled ? new Date() : null,
    syncCompletedAt: input.enabled ? null : existing?.syncCompletedAt ?? null,
    updatedAt: new Date(),
  };

  let row: StorageBackendRow;
  if (existing) {
    const [updated] = await db
      .update(schema.storageBackends)
      .set(values)
      .where(eq(schema.storageBackends.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update Git export configuration');
    row = updated;
  } else {
    const [created] = await db
      .insert(schema.storageBackends)
      .values({
        ...values,
        secretEncrypted: input.secret ? encryptKey(input.secret) : null,
      })
      .returning();
    if (!created) throw new Error('Failed to create Git export configuration');
    row = created;
  }

  if (input.enabled) await enqueueGitExport();
  return toView(row!);
}

export async function generateGitSshKey(ctx: PermCtx): Promise<GitSshKeyResult> {
  assertCanManageStorage(ctx);
  const directory = await mkdtemp(join(tmpdir(), 'next-wiki-git-key-'));
  const privateKeyPath = join(directory, 'id_ed25519');

  try {
    await execFileAsync('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-C',
      'next-wiki-git-export',
      '-f',
      privateKeyPath,
    ]);
    const privateKey = await readFile(privateKeyPath, 'utf8');
    const publicKey = (await readFile(`${privateKeyPath}.pub`, 'utf8')).trim();
    const { stdout } = await execFileAsync('ssh-keygen', ['-lf', `${privateKeyPath}.pub`]);
    const fingerprint = stdout.trim().split(/\s+/)[1] ?? stdout.trim();
    const existing = await findGitExport();
    const previousConfig = existing
      ? gitBackendConfigSchema.partial().parse(existing.config)
      : {};
    const config = {
      remoteUrl: previousConfig.remoteUrl ?? 'git@github.com:owner/repository.git',
      branch: previousConfig.branch ?? 'main',
      assetsDir: previousConfig.assetsDir ?? 'assets',
      username: previousConfig.username,
      authMode: 'ssh' as const,
      publicKey,
      fingerprint,
    };

    if (existing) {
      await db
        .update(schema.storageBackends)
        .set({
          config,
          secretEncrypted: encryptKey(privateKey),
          isActive: false,
          replicaState: 'disabled',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.storageBackends.id, existing.id));
    } else {
      await db.insert(schema.storageBackends).values({
        type: 'git',
        purpose: 'git_export',
        isActive: false,
        replicaState: 'disabled',
        config,
        secretEncrypted: encryptKey(privateKey),
      });
    }
    return { publicKey, fingerprint };
  } catch (error) {
    throw new DomainError(
      'STORAGE_UNAVAILABLE',
      `Failed to generate SSH key: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Queue a full-snapshot reconciliation. `reason: 'publish'` honours the
 * per-config `autoSyncOnPublish` toggle so content edits do not push to Git
 * when the operator opted out; manual, enable, and scheduled triggers always run.
 */
export async function enqueueGitExport(
  reason: 'manual' | 'publish' = 'manual',
): Promise<boolean> {
  const backend = await findGitExport();
  if (!backend?.isActive) return false;
  if (reason === 'publish') {
    const config = gitBackendConfigSchema.safeParse(backend.config);
    if (config.success && config.data.autoSyncOnPublish === false) return false;
  }
  return (
    (await enqueue(
      QUEUES.gitExport,
      { backendId: backend.id },
      {
        singletonKey: backend.id,
        singletonNextSlot: true,
        retryLimit: 5,
        retryDelay: 15,
        retryBackoff: true,
        retryDelayMax: 300,
      },
    )) !== null
  );
}

export async function runGitExportNow(ctx: PermCtx): Promise<{ queued: boolean }> {
  assertCanManageStorage(ctx);
  const backend = await findGitExport();
  if (!backend?.isActive) {
    throw new DomainError('BAD_REQUEST', 'Git export is not enabled');
  }
  const queued = await enqueueGitExport('manual');
  if (!queued) {
    throw new DomainError('STORAGE_UNAVAILABLE', 'Git export could not be queued; the job queue is unavailable');
  }
  return { queued };
}

/**
 * Invoked on a fixed one-minute cron. Enqueues a reconciliation only when the
 * operator enabled scheduled sync and at least the configured interval has
 * elapsed since the last successful sync.
 */
export async function tickScheduledGitExport(now: Date = new Date()): Promise<boolean> {
  const backend = await findGitExport();
  if (!backend?.isActive) return false;
  const config = gitBackendConfigSchema.safeParse(backend.config);
  if (!config.success || !config.data.scheduledSyncEnabled) return false;
  if (backend.replicaState === 'backfilling') return false;

  const intervalMs = config.data.scheduledSyncIntervalMinutes * 60_000;
  const last = backend.lastSyncAt?.getTime() ?? 0;
  if (now.getTime() - last < intervalMs) return false;
  return enqueueGitExport('manual');
}
