import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  staticSiteTargetUpsertSchema,
  type StaticSiteExclusionCounts,
  type StaticSitePublicationTrigger,
  type StaticSitePublicationView,
  type StaticSiteTargetUpsertInput,
  type StaticSiteTargetView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { encryptKey } from '@/server/crypto/key-encryption';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

const execFileAsync = promisify(execFile);

type TargetRow = typeof schema.staticSiteTargets.$inferSelect;
type PublicationRow = typeof schema.staticSitePublications.$inferSelect;

/**
 * Static site publishing (031).
 *
 * Publishing puts wiki content at a public address under the deployment's own
 * name, so it is session-admin only and has its own permission action: reusing
 * `manage_storage` would let a key issued for storage administration publish the
 * wiki to the internet.
 */
export function assertCanManageStaticSite(ctx: PermCtx): void {
  if (!can(ctx, 'manage_static_site', { kind: 'static_site' })) {
    throw new DomainError(
      'FORBIDDEN',
      'You do not have permission to manage static site publishing',
    );
  }
}

function toPublicationView(row: PublicationRow): StaticSitePublicationView {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    pagesPublished: row.pagesPublished,
    assetsPublished: row.assetsPublished,
    pagesExcluded: row.pagesExcluded,
    exclusionsByReason: (row.exclusionSummary ?? {}) as StaticSiteExclusionCounts,
    bytesTotal: row.bytesTotal,
    commitSha: row.commitSha,
    forcedPush: row.forcedPush,
    errorMessage: row.errorMessage,
  };
}

/** The credential is represented by `hasSecret` and never returned. */
function toTargetView(
  row: TargetRow,
  lastPublication: PublicationRow | null,
): StaticSiteTargetView {
  return {
    id: row.id,
    isEnabled: row.isEnabled,
    remoteUrl: row.remoteUrl,
    branch: row.branch,
    baseUrl: row.baseUrl,
    authMode: row.authMode,
    username: row.username,
    hasSecret: row.secretEncrypted !== null,
    publicKey: row.publicKey,
    fingerprint: row.fingerprint,
    autoPublishOnChange: row.autoPublishOnChange,
    scheduledPublishEnabled: row.scheduledPublishEnabled,
    scheduledIntervalMinutes: row.scheduledIntervalMinutes,
    isStale: row.isStale,
    lastPublication: lastPublication ? toPublicationView(lastPublication) : null,
  };
}

/** This release supports one target per deployment (see spec Assumptions). */
export async function findTarget(): Promise<TargetRow | undefined> {
  return db.query.staticSiteTargets.findFirst();
}

async function findLastPublication(targetId: string): Promise<PublicationRow | null> {
  const row = await db.query.staticSitePublications.findFirst({
    where: eq(schema.staticSitePublications.targetId, targetId),
    orderBy: desc(schema.staticSitePublications.createdAt),
  });
  return row ?? null;
}

export async function getTarget(ctx: PermCtx): Promise<StaticSiteTargetView | null> {
  assertCanManageStaticSite(ctx);
  const target = await findTarget();
  if (!target) return null;
  return toTargetView(target, await findLastPublication(target.id));
}

export async function configureTarget(
  ctx: PermCtx,
  // Input shape: the schema's defaulted fields are optional on the wire and
  // filled in by the parse below.
  input: StaticSiteTargetUpsertInput,
): Promise<{ view: StaticSiteTargetView; queuedPublicationId: string | null }> {
  assertCanManageStaticSite(ctx);
  const parsed = staticSiteTargetUpsertSchema.parse(input);
  const existing = await findTarget();

  // Changing auth mode invalidates a stored credential of the other kind, so it
  // is dropped rather than left behind to fail confusingly at push time.
  const authModeChanged = existing != null && existing.authMode !== parsed.authMode;
  const hasUsableStoredSecret = Boolean(existing?.secretEncrypted) && !authModeChanged;

  if (parsed.isEnabled && !parsed.secret && !hasUsableStoredSecret) {
    throw new DomainError(
      'BAD_REQUEST',
      parsed.authMode === 'ssh'
        ? 'Generate or provide an SSH key before enabling publishing'
        : 'An access token is required before enabling publishing',
    );
  }

  const secretUpdate = parsed.secret
    ? { secretEncrypted: encryptKey(parsed.secret) }
    : authModeChanged
      ? { secretEncrypted: null }
      : {};

  const values = {
    isEnabled: parsed.isEnabled,
    remoteUrl: parsed.remoteUrl,
    branch: parsed.branch,
    baseUrl: parsed.baseUrl,
    authMode: parsed.authMode,
    username: parsed.username ?? null,
    autoPublishOnChange: parsed.autoPublishOnChange,
    scheduledPublishEnabled: parsed.scheduledPublishEnabled,
    scheduledIntervalMinutes: parsed.scheduledIntervalMinutes,
    ...secretUpdate,
    ...(authModeChanged ? { publicKey: null, fingerprint: null } : {}),
    updatedAt: new Date(),
  };

  let row: TargetRow;
  if (existing) {
    const [updated] = await db
      .update(schema.staticSiteTargets)
      .set(values)
      .where(eq(schema.staticSiteTargets.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update static site target');
    row = updated;
  } else {
    const [created] = await db.insert(schema.staticSiteTargets).values(values).returning();
    if (!created) throw new Error('Failed to create static site target');
    row = created;
  }

  // Enabling publishes immediately: the operator's intent in flipping the
  // switch is to have a site, not to have a configuration.
  const queued = parsed.isEnabled ? await enqueuePublication(row, 'manual') : null;
  return {
    view: toTargetView(row, await findLastPublication(row.id)),
    queuedPublicationId: queued,
  };
}

export async function deleteTarget(ctx: PermCtx): Promise<void> {
  assertCanManageStaticSite(ctx);
  const target = await findTarget();
  if (!target) return;
  // Destroys the stored credential (FR-037). Deliberately does not touch the
  // published site: taking a site down is a separate, explicitly confirmed act,
  // so removing configuration can never silently unpublish.
  await db.delete(schema.staticSiteTargets).where(eq(schema.staticSiteTargets.id, target.id));
}

export async function generateSshKey(
  ctx: PermCtx,
): Promise<{ publicKey: string; fingerprint: string }> {
  assertCanManageStaticSite(ctx);
  const directory = await mkdtemp(join(tmpdir(), 'next-wiki-static-site-key-'));
  const privateKeyPath = join(directory, 'id_ed25519');

  try {
    await execFileAsync('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-C',
      'next-wiki-static-site',
      '-f',
      privateKeyPath,
    ]);
    const privateKey = await readFile(privateKeyPath, 'utf8');
    const publicKey = (await readFile(`${privateKeyPath}.pub`, 'utf8')).trim();
    const { stdout } = await execFileAsync('ssh-keygen', ['-lf', `${privateKeyPath}.pub`]);
    const fingerprint = stdout.trim().split(/\s+/)[1] ?? stdout.trim();

    const existing = await findTarget();
    if (existing) {
      await db
        .update(schema.staticSiteTargets)
        .set({
          authMode: 'ssh',
          publicKey,
          fingerprint,
          secretEncrypted: encryptKey(privateKey),
          // The new key is not installed on the remote yet, so publishing would
          // fail; require an explicit re-enable after the operator adds it.
          isEnabled: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.staticSiteTargets.id, existing.id));
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
 * Create a run record and enqueue it. Returns the publication id, or null when
 * there is nothing to enqueue.
 *
 * A run already in flight is not duplicated: the queue's singleton slot
 * collapses further triggers into one follow-up pass, which is what keeps a
 * burst of publishes from becoming a burst of full site rebuilds.
 */
export async function enqueuePublication(
  target: TargetRow,
  trigger: StaticSitePublicationTrigger,
): Promise<string | null> {
  // Reuse a run that has not finished yet rather than stacking a second one.
  // Without this a burst of content changes leaves a trail of rows that can
  // never run, because the queue's singleton slot merges the jobs behind them.
  // A takedown is exempt: it must not be swallowed by a pending publish.
  if (trigger !== 'takedown') {
    const active = await db.query.staticSitePublications.findFirst({
      where: and(
        eq(schema.staticSitePublications.targetId, target.id),
        inArray(schema.staticSitePublications.status, ['queued', 'running']),
      ),
      orderBy: desc(schema.staticSitePublications.createdAt),
    });
    if (active) {
      // Mark the site out of date so the follow-up pass is still warranted.
      await db
        .update(schema.staticSiteTargets)
        .set({ isStale: true, updatedAt: new Date() })
        .where(eq(schema.staticSiteTargets.id, target.id));
      return active.id;
    }
  }

  const [publication] = await db
    .insert(schema.staticSitePublications)
    .values({ targetId: target.id, trigger, status: 'queued' })
    .returning();
  if (!publication) return null;

  await db
    .update(schema.staticSiteTargets)
    .set({ lastPublicationId: publication.id, updatedAt: new Date() })
    .where(eq(schema.staticSiteTargets.id, target.id));

  await enqueue(
    QUEUES.staticSitePublish,
    { targetId: target.id, publicationId: publication.id },
    { singletonKey: target.id, singletonNextSlot: true },
  );
  return publication.id;
}

export async function publishNow(
  ctx: PermCtx,
  trigger: StaticSitePublicationTrigger = 'manual',
): Promise<StaticSitePublicationView> {
  assertCanManageStaticSite(ctx);
  const target = await findTarget();
  if (!target) throw new DomainError('BAD_REQUEST', 'Static site publishing is not configured');
  if (!target.isEnabled && trigger !== 'takedown') {
    throw new DomainError('BAD_REQUEST', 'Static site publishing is not enabled');
  }

  const id = await enqueuePublication(target, trigger);
  if (!id) throw new Error('Failed to queue publication');
  const row = await db.query.staticSitePublications.findFirst({
    where: eq(schema.staticSitePublications.id, id),
  });
  if (!row) throw new Error('Failed to read queued publication');
  return toPublicationView(row);
}

export async function listPublications(
  ctx: PermCtx,
  limit = 20,
): Promise<StaticSitePublicationView[]> {
  assertCanManageStaticSite(ctx);
  const target = await findTarget();
  if (!target) return [];
  const rows = await db.query.staticSitePublications.findMany({
    where: eq(schema.staticSitePublications.targetId, target.id),
    orderBy: desc(schema.staticSitePublications.createdAt),
    limit: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map(toPublicationView);
}

export async function getPublication(
  ctx: PermCtx,
  id: string,
): Promise<StaticSitePublicationView | null> {
  assertCanManageStaticSite(ctx);
  const row = await db.query.staticSitePublications.findFirst({
    where: eq(schema.staticSitePublications.id, id),
  });
  return row ? toPublicationView(row) : null;
}

/**
 * Mark the published site as out of date, and republish when the operator asked
 * for that. Called from the public-content mutation paths that already
 * revalidate the wiki's own ISR representation.
 */
export async function markStaleAndMaybePublish(): Promise<void> {
  const target = await findTarget();
  if (!target?.isEnabled) return;
  await db
    .update(schema.staticSiteTargets)
    .set({ isStale: true, updatedAt: new Date() })
    .where(eq(schema.staticSiteTargets.id, target.id));
  if (target.autoPublishOnChange) await enqueuePublication(target, 'content_change');
}
