import { randomUUID } from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DatabaseStore } from '@/server/content-store/database-store';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
import { getActiveStore } from '@/server/content-store/registry';
import { renderMarkdown } from '@/server/pipeline';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { logger } from '@/server/logger';
import { QUEUES } from './runtime';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { persistRevisionMetadata } from '@/server/services/page-metadata';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { clearPendingSwitchIfMatches, type WritingModeSwitchOptions } from '@/server/services/writing-mode';

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

async function materializeLinks(
  tx: Transaction,
  defaultSpaceId: string,
  activeStore: Awaited<ReturnType<typeof getActiveStore>>,
): Promise<{ materialized: number; deleted: number }> {
  const links = await tx
    .select()
    .from(schema.pages)
    .where(and(
      eq(schema.pages.spaceId, defaultSpaceId),
      eq(schema.pages.kind, 'link'),
      isNull(schema.pages.deletedAt),
    ))
    .orderBy(asc(schema.pages.path), asc(schema.pages.locale), asc(schema.pages.id));

  let materialized = 0;
  let deleted = 0;
  for (const link of links) {
    const target = link.linkTargetPageId
      ? await tx.query.pages.findFirst({
          where: and(
            eq(schema.pages.id, link.linkTargetPageId),
            eq(schema.pages.kind, 'native'),
            isNull(schema.pages.deletedAt),
          ),
        })
      : null;
    const targetRevision = target?.currentPublishedVersionId
      ? await tx.query.pageRevisions.findFirst({
          where: and(
            eq(schema.pageRevisions.id, target.currentPublishedVersionId),
            eq(schema.pageRevisions.status, 'published'),
          ),
        })
      : null;

    if (!target || !targetRevision) {
      await tx
        .update(schema.pages)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.pages.id, link.id));
      deleted += 1;
      continue;
    }

    // The target remains available until all link pages have their own published
    // revision. For an external active store, putMarkdown stages an orphan-safe
    // object before the transaction exposes its revision row.
    const source = await readMarkdownWithFallback(targetRevision);
    const revisionId = randomUUID();
    const { html, hash } = renderMarkdown(source);
    if (activeStore.type !== 'database') await activeStore.putMarkdown(revisionId, source);

    const versionRows = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, link.id));
    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: link.id,
        versionNumber: (versionRows[0]?.value ?? 0) + 1,
        locale: link.locale,
        contentType: 'text/markdown',
        contentSource: source,
        contentHtml: html,
        contentHash: hash,
        authorId: link.authorId,
        status: 'published',
        actorKind: 'machine',
        // Preserve the historical soft-link target even though the page itself
        // becomes native once Copilot mode no longer has generated space.
        linkTargetPageId: target.id,
        publishedAt: new Date(),
      })
      .returning();
    if (!revision) throw new Error('Failed to materialize link page');
    if (activeStore.type === 'database') {
      await new DatabaseStore(tx).putMarkdown(revision.id, source);
    }
    await persistRevisionMetadata(tx, {
      revisionId: revision.id,
      spaceId: defaultSpaceId,
      source,
      fallbackTitle: link.title,
    });
    await syncRevisionAssetRefs(tx, revision.id, source);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);
    await tx
      .update(schema.pages)
      .set({
        kind: 'native',
        linkTargetPageId: null,
        latestVersionId: revision.id,
        currentPublishedVersionId: revision.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, link.id));
    materialized += 1;
  }
  return { materialized, deleted };
}

async function moveSpacePages(
  tx: Transaction,
  input: {
    sourceSpaceId: string;
    sourceSpace: 'raw' | 'generated';
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
  const activeStore = await getActiveStore();
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

    const links = await materializeLinks(tx, defaultSpace.id, activeStore);
    const rawMove = await moveSpacePages(tx, {
      sourceSpaceId: rawSpace.id,
      sourceSpace: 'raw',
      defaultSpaceId: defaultSpace.id,
      visibility: input.rawVisibility,
      occupied,
    });
    const generatedMove = await moveSpacePages(tx, {
      sourceSpaceId: generatedSpace.id,
      sourceSpace: 'generated',
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
