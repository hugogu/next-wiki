import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { resolveCredential } from '@/server/services/integrations';
import { buildGitEnvironment, git, GIT_TIMEOUT_MS } from '@/server/git/transport';
import { getActiveThemeCss } from '@/server/services/system-theme';
import { getSiteName } from '@/server/services/site-settings';
import { buildSnapshot } from '@/server/static-site/snapshot';
import { preflightSnapshot } from '@/server/static-site/preflight';
import { readStaticSiteAssets, staticSiteAssetsDir } from '@/server/static-site/build-assets';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { logger } from '@/server/logger';

const execFileAsync = promisify(execFile);

type PublicationRow = typeof schema.staticSitePublications.$inferSelect;
type TargetRow = typeof schema.staticSiteTargets.$inferSelect;

let activeRun: Promise<void> | null = null;

/**
 * Queue the single follow-up pass a mid-run change earns.
 *
 * Written here rather than through the service to keep the job's dependencies
 * one-directional; the service enqueues jobs, the job does not call back into it.
 */
async function enqueueFollowUp(targetId: string): Promise<void> {
  const [publication] = await db
    .insert(schema.staticSitePublications)
    .values({ targetId, trigger: 'content_change', status: 'queued' })
    .returning();
  if (!publication) return;
  await db
    .update(schema.staticSiteTargets)
    .set({ lastPublicationId: publication.id, updatedAt: new Date() })
    .where(eq(schema.staticSiteTargets.id, targetId));
  await enqueue(
    QUEUES.staticSitePublish,
    { targetId, publicationId: publication.id },
    { singletonKey: targetId, singletonNextSlot: true },
  );
}

/**
 * Strip anything credential-shaped from a message before it is stored or shown.
 *
 * Git and ssh put the remote in their error output, and a misconfigured remote
 * can carry a token in its userinfo. A run record is displayed in the admin UI
 * and kept indefinitely, so this is the last chokepoint before a secret becomes
 * durable.
 */
export function redactCredentials(message: string, secret?: string | null): string {
  let output = message;
  if (secret && secret.length >= 8) {
    output = output.split(secret).join('[redacted]');
  }
  output = output.replace(/(\w+:\/\/)[^/\s@]*@/g, '$1[redacted]@');
  return output;
}

async function markRunning(publicationId: string, targetId: string): Promise<void> {
  await db
    .update(schema.staticSitePublications)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.staticSitePublications.id, publicationId));
  // Cleared here, not on completion: this run publishes the state as of now, so
  // anything that arrives while it works sets the flag again and is recognized
  // afterwards as needing one more pass.
  await db
    .update(schema.staticSiteTargets)
    .set({ isStale: false, updatedAt: new Date() })
    .where(eq(schema.staticSiteTargets.id, targetId));
}

async function markFailed(
  publicationId: string,
  message: string,
  secret?: string | null,
): Promise<void> {
  await db
    .update(schema.staticSitePublications)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorMessage: redactCredentials(message, secret),
    })
    .where(eq(schema.staticSitePublications.id, publicationId));
}

async function markCancelled(publicationId: string, reason: string): Promise<void> {
  await db
    .update(schema.staticSitePublications)
    .set({ status: 'cancelled', completedAt: new Date(), errorMessage: reason })
    .where(eq(schema.staticSitePublications.id, publicationId));
}

async function loadRun(
  targetId: string,
  publicationId: string,
): Promise<{ target: TargetRow; publication: PublicationRow } | null> {
  const target = await db.query.staticSiteTargets.findFirst({
    where: eq(schema.staticSiteTargets.id, targetId),
  });
  const publication = await db.query.staticSitePublications.findFirst({
    where: eq(schema.staticSitePublications.id, publicationId),
  });
  if (!publication) return null;
  if (!target) {
    await markCancelled(publicationId, 'The publishing target was removed before the run started');
    return null;
  }
  return { target, publication };
}

async function clearWorkingTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory)) {
    if (entry === '.git') continue;
    await rm(join(directory, entry), { recursive: true, force: true });
  }
}

/**
 * Deliver a prepared directory to the target branch.
 *
 * Atomicity comes from the transport: a reader sees either the previous commit
 * or the new one, never a half-updated tree. This is a real advantage of Git
 * delivery over per-file upload APIs.
 */
async function deliver(
  target: TargetRow,
  credential: { authMode: 'https_token' | 'ssh'; username: string | null; secret: string },
  contentsDir: string | null,
  commitMessage: string,
): Promise<{ commitSha: string | null; forcedPush: boolean }> {
  const temp = await mkdtemp(join(tmpdir(), 'next-wiki-static-site-'));
  const checkout = join(temp, 'repository');
  try {
    const env = await buildGitEnvironment(
      temp,
      credential.authMode,
      credential.username ?? undefined,
      credential.secret,
    );
    await execFileAsync('git', ['init', checkout], {
      env,
      timeout: GIT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    await git(checkout, ['remote', 'add', 'origin', target.remoteUrl], env);

    let remoteBranchExists = true;
    try {
      await git(checkout, ['fetch', '--depth=1', 'origin', target.branch], env);
      await git(checkout, ['checkout', '-B', target.branch, 'FETCH_HEAD'], env);
    } catch {
      remoteBranchExists = false;
      await git(checkout, ['checkout', '--orphan', target.branch], env);
    }

    // The branch is owned by this feature: replacing the tree wholesale is what
    // makes retired content disappear without a separate cleanup step.
    await clearWorkingTree(checkout);
    if (contentsDir) await cp(contentsDir, checkout, { recursive: true });
    await git(checkout, ['add', '-A'], env);

    let changed = true;
    try {
      await git(checkout, ['diff', '--cached', '--quiet'], env);
      changed = false;
    } catch {
      // Exit code 1 means staged content differs.
    }
    if (!changed) return { commitSha: null, forcedPush: false };

    await git(checkout, ['commit', '-m', commitMessage], env);

    let forcedPush = false;
    try {
      await git(checkout, ['push', 'origin', `HEAD:refs/heads/${target.branch}`], env);
    } catch (pushError) {
      if (!remoteBranchExists) throw pushError;
      await git(checkout, ['fetch', 'origin', target.branch], env);
      await git(
        checkout,
        ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${target.branch}`],
        env,
      );
      forcedPush = true;
    }

    const { stdout } = await git(checkout, ['rev-parse', 'HEAD'], env);
    return { commitSha: stdout.trim(), forcedPush };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function executePublish(targetId: string, publicationId: string): Promise<void> {
  const loaded = await loadRun(targetId, publicationId);
  if (!loaded) return;
  const { target, publication } = loaded;
  const isTakedown = publication.trigger === 'takedown';

  if (!target.isEnabled && !isTakedown) {
    await markCancelled(publicationId, 'Publishing was disabled before the run started');
    return;
  }
  // Credentials come from the shared integration: the account reached is the
  // same one Git export reaches, so it is configured once.
  const credential = await resolveCredential('github');
  if (!credential) {
    await markFailed(
      publicationId,
      'The GitHub integration is not configured, so there is no credential to publish with',
    );
    return;
  }

  await markRunning(publicationId, target.id);
  const secret = credential.secret;
  let staging: string | null = null;

  try {
    let counts = { pages: 0, assets: 0, excluded: 0 };
    let exclusions = {};

    if (!isTakedown) {
      staging = await mkdtemp(join(tmpdir(), 'next-wiki-static-site-build-'));
      const [themeCss, siteName, documentAssets] = await Promise.all([
        getActiveThemeCss(),
        getSiteName(),
        // Read before rendering: a missing build step should fail the run
        // before it writes a site whose stylesheet and script 404.
        readStaticSiteAssets(),
      ]);
      const manifest = await buildSnapshot({
        rootDir: staging,
        baseUrl: target.baseUrl,
        siteName,
        themeCss,
        documentAssets,
      });
      // Build-time assets (stylesheet, client runtime, KaTeX) are fixed per
      // image, so they are copied in rather than regenerated per publish.
      await cp(staticSiteAssetsDir(), join(staging, '_static'), { recursive: true });
      preflightSnapshot(manifest);
      counts = {
        pages: manifest.pagesPublished,
        assets: manifest.assetsPublished,
        excluded: manifest.pagesExcluded,
      };
      exclusions = manifest.exclusions;
    }

    const { commitSha, forcedPush } = await deliver(
      target,
      credential,
      staging,
      isTakedown
        ? 'Remove published site'
        : `Publish ${counts.pages} pages and ${counts.assets} assets`,
    );

    await db
      .update(schema.staticSitePublications)
      .set({
        status: 'succeeded',
        completedAt: new Date(),
        pagesPublished: counts.pages,
        assetsPublished: counts.assets,
        pagesExcluded: counts.excluded,
        exclusionSummary: exclusions,
        commitSha,
        forcedPush,
      })
      .where(eq(schema.staticSitePublications.id, publicationId));

    // Content that changed while this run was working leaves the flag set. One
    // follow-up pass reconciles all of it, so a burst of edits costs one extra
    // rebuild rather than one per edit (FR-030).
    const after = await db.query.staticSiteTargets.findFirst({
      where: eq(schema.staticSiteTargets.id, target.id),
    });
    if (after?.isStale && after.isEnabled && after.autoPublishOnChange && !isTakedown) {
      await enqueueFollowUp(after.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(publicationId, message, secret);
    logger.error('Static site publish failed', {
      targetId,
      publicationId,
      error: redactCredentials(message, secret),
    });
    throw error;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Serialize publishes within this worker, so two runs never write the same
 * branch concurrently.
 *
 * Collapsing bursts of triggers into a single follow-up pass is handled a level
 * up: the service reuses an in-flight run instead of queueing a second one, and
 * the queue's singleton slot merges anything that still gets through. US6
 * completes that story by re-publishing once when content changed mid-run.
 */
export async function runStaticSitePublish(
  targetId: string,
  publicationId: string,
): Promise<void> {
  if (activeRun) {
    await activeRun;
    return;
  }

  activeRun = executePublish(targetId, publicationId);
  try {
    await activeRun;
  } finally {
    activeRun = null;
  }
}
