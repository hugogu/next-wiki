import type { PgBoss } from 'pg-boss';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { logger } from '@/server/logger';
import { QUEUES } from './runtime';
import { kickReplication } from '@/server/services/storage-replication';
import { clearPendingSwitchIfMatches, type WritingModeSwitchOptions } from '@/server/services/writing-mode';
import { canonicalSpacePath } from '@/server/services/space-routes';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WritingModeSwitchJobData = WritingModeSwitchOptions;

export type WritingModeSwitchReport = {
  status: 'completed' | 'noop';
  movedPages: number;
  materializedLinks: number;
  deletedLinks: number;
  conflicts: Array<{
    pageId: string;
    sourceSpace: 'raw' | 'generated';
    sourcePath: string;
    locale: string;
    destinationPath: string;
  }>;
};

const SETTINGS_ID = 'default';

function leafSlug(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function pathWithSuffix(path: string, suffix: number): string {
  const segments = path.split('/');
  const leaf = segments.pop() ?? path;
  return [...segments, `${leaf}-${suffix}`].join('/');
}

function destinationPath(kind: 'raw' | 'generated', sourcePath: string): string {
  return `${kind}/${sourcePath}`;
}

function nextFreePath(
  occupied: Set<string>,
  locale: string,
  desired: string,
): string {
  const key = (path: string) => `${locale}\u0000${path}`;
  if (!occupied.has(key(desired))) {
    occupied.add(key(desired));
    return desired;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = pathWithSuffix(desired, suffix);
    if (!occupied.has(key(candidate))) {
      occupied.add(key(candidate));
      return candidate;
    }
  }
}

async function getLockedSettings(tx: Transaction) {
  await tx.execute(sql`select id from writing_mode_settings where id = ${SETTINGS_ID} for update`);
  return tx.query.writingModeSettings.findFirst({
    where: eq(schema.writingModeSettings.id, SETTINGS_ID),
  });
}

/** Copilot has no active link model: preserve the audit trail, then retire it. */
async function retireLinks(
  tx: Transaction,
  defaultSpaceId: string,
): Promise<{ materialized: number; deleted: number }> {
  const links = await tx
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.spaceId, defaultSpaceId), eq(schema.pages.kind, 'link'), isNull(schema.pages.deletedAt)));
  let deleted = 0;
  for (const link of links) {
    if (link.linkTargetPageId) {
      await tx.insert(schema.retiredLinkPages).values({
        linkPageId: link.id,
        legacyPath: link.path,
        targetPageId: link.linkTargetPageId,
        disposition: 'unavailable',
      }).onConflictDoNothing();
    }
    await tx.update(schema.pages).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.pages.id, link.id));
    deleted += 1;
  }
  return { materialized: 0, deleted };
}

async function moveSpacePages(
  tx: Transaction,
  input: {
    sourceSpaceId: string;
    sourceSpace: 'raw' | 'generated';
    sourceSpaceRow: typeof schema.spaces.$inferSelect;
    defaultSpaceId: string;
    visibility: WritingModeSwitchOptions['rawVisibility'];
    occupied: Set<string>;
  },
): Promise<{ count: number; conflicts: WritingModeSwitchReport['conflicts'] }> {
  const pages = await tx
    .select()
    .from(schema.pages)
    .where(eq(schema.pages.spaceId, input.sourceSpaceId))
    .orderBy(asc(schema.pages.path), asc(schema.pages.locale), asc(schema.pages.id));

  const conflicts: WritingModeSwitchReport['conflicts'] = [];
  for (const page of pages) {
    if (page.deletedAt) continue;
    const desired = destinationPath(input.sourceSpace, page.path);
    const path = nextFreePath(input.occupied, page.locale, desired);
    if (path !== desired) {
      conflicts.push({
        pageId: page.id,
        sourceSpace: input.sourceSpace,
        sourcePath: page.path,
        locale: page.locale,
        destinationPath: path,
      });
    }
    await tx
      .update(schema.pages)
      .set({
        spaceId: input.defaultSpaceId,
        path,
        slug: leafSlug(path),
        visibility: input.visibility,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));
    await tx
      .insert(schema.pageRouteRedirects)
      .values({
        legacyRoute: canonicalSpacePath(input.sourceSpaceRow, page.path, page.locale),
        targetPageId: page.id,
        reason: 'writing_mode_switch',
      })
      .onConflictDoNothing();
  }
  return { count: pages.length, conflicts };
}

/**
 * Performs the irreversible direction of the writing-mode switch. Every
 * database mutation shares one transaction; an external markdown object may be
 * staged before a rollback, but cannot be referenced without the rolled-back
 * revision and is handled by ordinary orphan cleanup.
 */
export async function runWritingModeSwitch(
  jobId: string,
  input: WritingModeSwitchJobData,
): Promise<WritingModeSwitchReport> {
  const report = await db.transaction(async (tx) => {
    const settings = await getLockedSettings(tx);
    if (!settings || settings.pendingMode !== 'copilot' || settings.switchJobId !== jobId) {
      return { status: 'noop' as const, movedPages: 0, materializedLinks: 0, deletedLinks: 0, conflicts: [] };
    }

    const [defaultSpace, rawSpace, generatedSpace] = await Promise.all([
      tx.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') }),
      tx.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'raw') }),
      tx.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') }),
    ]);
    if (!defaultSpace || !rawSpace || !generatedSpace) {
      throw new Error('Writing-mode spaces are unavailable');
    }

    const occupiedRows = await tx
      .select({ path: schema.pages.path, locale: schema.pages.locale })
      .from(schema.pages)
      .where(eq(schema.pages.spaceId, defaultSpace.id));
    const occupied = new Set(occupiedRows.map((page) => `${page.locale}\u0000${page.path}`));

    const links = await retireLinks(tx, defaultSpace.id);
    const rawMove = await moveSpacePages(tx, {
      sourceSpaceId: rawSpace.id,
      sourceSpace: 'raw',
      sourceSpaceRow: rawSpace,
      defaultSpaceId: defaultSpace.id,
      visibility: input.rawVisibility,
      occupied,
    });
    const generatedMove = await moveSpacePages(tx, {
      sourceSpaceId: generatedSpace.id,
      sourceSpace: 'generated',
      sourceSpaceRow: generatedSpace,
      defaultSpaceId: defaultSpace.id,
      visibility: input.generatedVisibility,
      occupied,
    });

    await tx
      .update(schema.writingModeSettings)
      .set({
        mode: 'copilot',
        pendingMode: null,
        switchJobId: null,
        switchOptions: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.writingModeSettings.id, SETTINGS_ID));

    return {
      status: 'completed' as const,
      movedPages: rawMove.count + generatedMove.count,
      materializedLinks: links.materialized,
      deletedLinks: links.deleted,
      conflicts: [...rawMove.conflicts, ...generatedMove.conflicts],
    };
  });

  if (report.status === 'completed') {
    invalidatePublicContentCache();
    await kickReplication();
  }
  return report;
}

/** Re-enqueue only when a pending marker survived a process crash before send. */
export async function recoverWritingModeSwitch(boss: PgBoss): Promise<void> {
  const settings = await db.query.writingModeSettings.findFirst({
    where: eq(schema.writingModeSettings.id, SETTINGS_ID),
  });
  if (!settings?.switchJobId || settings.pendingMode !== 'copilot') return;
  const existing = await boss.getJobById(QUEUES.writingModeSwitch, settings.switchJobId);
  if (existing) return;

  const options = settings.switchOptions;
  if (!options?.rawVisibility || !options.generatedVisibility) {
    await clearPendingSwitchIfMatches(settings.switchJobId, settings.updatedBy);
    logger.error('cleared unrecoverable writing-mode switch without options', { jobId: settings.switchJobId });
    return;
  }
  const queued = await boss.send(QUEUES.writingModeSwitch, options, { id: settings.switchJobId });
  if (queued) logger.info('re-enqueued interrupted writing-mode switch', { jobId: settings.switchJobId });
}

/** Called after the final pg-boss retry has rolled back the migration. */
export async function clearWritingModeSwitchAfterTerminalFailure(jobId: string): Promise<void> {
  await clearPendingSwitchIfMatches(jobId, null);
  logger.error('cleared failed writing-mode switch', { jobId });
}
