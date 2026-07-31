import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { gitBackendConfigSchema } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { decryptKey } from '@/server/crypto/key-encryption';
import { materializeGitExport } from '@/server/git/export';
import { buildGitEnvironment, git, GIT_TIMEOUT_MS } from '@/server/git/transport';
import { logger } from '@/server/logger';

const execFileAsync = promisify(execFile);

let activeRun: Promise<void> | null = null;
let rerunRequested = false;

async function clearWorkingTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory)) {
    if (entry === '.git') continue;
    await rm(join(directory, entry), { recursive: true, force: true });
  }
}

async function executeExport(backendId: string): Promise<void> {
  const backend = await db.query.storageBackends.findFirst({
    where: eq(schema.storageBackends.id, backendId),
  });
  if (!backend || backend.purpose !== 'git_export' || !backend.isActive) return;
  if (!backend.secretEncrypted) throw new Error('Git credentials are not configured');

  const config = gitBackendConfigSchema.parse(backend.config);
  const secret = decryptKey(backend.secretEncrypted);
  const temp = await mkdtemp(join(tmpdir(), 'next-wiki-git-export-'));
  const checkout = join(temp, 'repository');
  let forceWarning: string | null = null;

  await db
    .update(schema.storageBackends)
    .set({
      replicaState: 'backfilling',
      syncStartedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.storageBackends.id, backendId));

  try {
    const env = await buildGitEnvironment(
      temp,
      config.authMode,
      config.username,
      secret,
    );
    await execFileAsync('git', ['init', checkout], {
      env,
      timeout: GIT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    await git(checkout, ['remote', 'add', 'origin', config.remoteUrl], env);

    let remoteBranchExists = true;
    try {
      await git(checkout, ['fetch', '--depth=1', 'origin', config.branch], env);
      await git(checkout, ['checkout', '-B', config.branch, 'FETCH_HEAD'], env);
    } catch {
      remoteBranchExists = false;
      await git(checkout, ['checkout', '--orphan', config.branch], env);
    }

    await clearWorkingTree(checkout);
    const snapshot = await materializeGitExport(checkout, config);
    await git(checkout, ['add', '-A'], env);

    let changed = true;
    try {
      await git(checkout, ['diff', '--cached', '--quiet'], env);
      changed = false;
    } catch {
      // Exit code 1 means staged content differs.
    }

    if (changed) {
      await git(
        checkout,
        ['commit', '-m', `Export ${snapshot.pages} pages and ${snapshot.assets} assets`],
        env,
      );
      try {
        await git(checkout, ['push', 'origin', `HEAD:refs/heads/${config.branch}`], env);
      } catch (pushError) {
        if (!remoteBranchExists) throw pushError;
        await git(checkout, ['fetch', 'origin', config.branch], env);
        await git(
          checkout,
          ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${config.branch}`],
          env,
        );
        forceWarning =
          'The remote branch had diverged and was overwritten with force-with-lease.';
      }
    }

    await db
      .update(schema.storageBackends)
      .set({
        replicaState: 'enabled',
        syncCompletedAt: new Date(),
        lastSyncAt: new Date(),
        lastError: forceWarning,
        updatedAt: new Date(),
      })
      .where(eq(schema.storageBackends.id, backendId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.storageBackends)
      .set({
        replicaState: 'degraded',
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(schema.storageBackends.id, backendId));
    logger.error('Git export failed', { backendId, error: message });
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/**
 * Serialize exports within this worker process. Any trigger received while a
 * run is active coalesces into one additional full-snapshot reconciliation.
 */
export async function runGitExport(backendId: string): Promise<void> {
  if (activeRun) {
    rerunRequested = true;
    await activeRun;
    return;
  }

  activeRun = (async () => {
    do {
      rerunRequested = false;
      await executeExport(backendId);
    } while (rerunRequested);
  })();
  try {
    await activeRun;
  } finally {
    activeRun = null;
  }
}
