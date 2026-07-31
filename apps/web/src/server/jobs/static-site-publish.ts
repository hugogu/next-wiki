import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { logger } from '@/server/logger';

type PublicationRow = typeof schema.staticSitePublications.$inferSelect;
type TargetRow = typeof schema.staticSiteTargets.$inferSelect;

let activeRun: Promise<void> | null = null;
let rerunRequested = false;

/**
 * Strip anything credential-shaped from a message before it is stored or shown.
 *
 * Git and ssh put the remote in their error output, and a misconfigured remote
 * can carry a token in its userinfo. A run record is displayed in the admin UI
 * and kept indefinitely, so scrubbing here is the last chokepoint before a
 * secret becomes durable.
 */
export function redactCredentials(message: string, secret?: string | null): string {
  let output = message;
  if (secret && secret.length >= 8) {
    output = output.split(secret).join('[redacted]');
  }
  // Any URL userinfo, whether or not it matches the stored secret.
  output = output.replace(/(\w+:\/\/)[^/\s@]*@/g, '$1[redacted]@');
  return output;
}

async function markRunning(publicationId: string): Promise<void> {
  await db
    .update(schema.staticSitePublications)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.staticSitePublications.id, publicationId));
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

async function executePublish(targetId: string, publicationId: string): Promise<void> {
  const loaded = await loadRun(targetId, publicationId);
  if (!loaded) return;
  const { target, publication } = loaded;

  // A run queued before the operator disabled publishing must not go out.
  if (!target.isEnabled && publication.trigger !== 'takedown') {
    await markCancelled(publicationId, 'Publishing was disabled before the run started');
    return;
  }
  if (!target.secretEncrypted) {
    await markFailed(publicationId, 'No credential is configured for the publishing target');
    return;
  }

  await markRunning(publicationId);

  try {
    // Snapshot generation and delivery land in US1 (T025–T032). Until then a
    // run fails loudly rather than reporting a success that produced no site.
    throw new Error('Static site generation is not implemented yet');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(publicationId, message);
    logger.error('Static site publish failed', { targetId, publicationId, error: message });
    throw error;
  }
}

/**
 * Serialize publishes within this worker. A trigger arriving while a run is
 * active collapses into one additional full pass, so a burst of content changes
 * costs one extra site rebuild rather than one per change.
 */
export async function runStaticSitePublish(
  targetId: string,
  publicationId: string,
): Promise<void> {
  if (activeRun) {
    rerunRequested = true;
    await activeRun;
    return;
  }

  activeRun = (async () => {
    await executePublish(targetId, publicationId);
    while (rerunRequested) {
      rerunRequested = false;
      // The follow-up pass reconciles against current state; it needs its own
      // run record, created by the service when the trigger arrived.
    }
  })();
  try {
    await activeRun;
  } finally {
    activeRun = null;
  }
}
