import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { inspectPortableArchive } from '@/server/transfers/archive-reader';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { parsePage } from '@/server/transfers/manifest';
import { isRunCancelRequested, markRunTerminal } from '@/server/services/transfers';
import { getRuntimeSource } from '@/server/services/transfer-sources';
import {
  WikiJsClient,
  computeWikiJsHistoryFingerprint,
  computeWikiJsPageFingerprint,
  normalizeHistoryLimit,
  selectHistoryWindow,
} from '@/server/transfers/wikijs-client';
import { getTransferConverter } from '@/server/transfers/registry';
import { getSpaceByKind, resolveSpace } from '@/server/services/spaces';
import { getMode } from '@/server/services/writing-mode';
import { DomainError } from '@/server/errors';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import type { NormalizedPortableManifest } from '@next-wiki/shared';

const WIKIJS_PREVIEW_BATCH_SIZE = 50;

async function availableKinds(): Promise<Set<NormalizedPortableManifest['pages'][number]['spaceKind']>> {
  const available: Set<NormalizedPortableManifest['pages'][number]['spaceKind']> = new Set(['wiki']);
  const [rawList, generatedList] = await Promise.all([
    getSpaceByKind('raw'),
    getSpaceByKind('generated'),
  ]);
  if (rawList.length > 0) available.add('raw');
  if (generatedList.length > 0) available.add('generated');
  return available;
}

async function previewArchive(run: typeof schema.transferRuns.$inferSelect) {
  const artifact = run.sourceArtifactId
    ? await db.query.transferArtifacts.findFirst({
        where: eq(schema.transferArtifacts.id, run.sourceArtifactId),
      })
    : null;
  if (!artifact || artifact.status !== 'ready') throw new Error('Source archive is unavailable');
  const inspected = await inspectPortableArchive(transferArtifactStore.pathFor(artifact.storageKey));
  const space = await resolveSpace();
  if (!space) throw new Error('Default space not found');
  const options = run.options as { conflictStrategy?: string; includeHistory?: boolean; historyLimit?: number };
  const strategy = options.conflictStrategy ?? 'skip';
  const includeHistory = Boolean(options.includeHistory);
  const historyLimit = normalizeHistoryLimit(options.historyLimit);
  const sourceIdentity = artifact.contentHash ?? artifact.id;
  const currentMode = await getMode();
  const sourceMode = inspected.manifest.source.writingMode;
  const hasModeMismatch = sourceMode !== currentMode;
  const kinds = await availableKinds();

  let created = 0;
  let replaced = 0;
  let skipped = 0;
  let crossModeSkips = 0;
  let warnings = 0;
  const items: (typeof schema.transferItems.$inferInsert)[] = [];
  for (const page of inspected.manifest.pages) {
    const bytes = await inspected.readEntry(page.entry);
    const parsed = parsePage(bytes.toString('utf8'));
    if (
      parsed.frontmatter.path !== page.path ||
      parsed.frontmatter.locale !== page.locale ||
      parsed.frontmatter.sourcePageId !== page.id
    ) {
      throw new Error(`Page frontmatter mismatch: ${page.entry}`);
    }
    if (!kinds.has(page.spaceKind)) {
      skipped += 1;
      crossModeSkips += 1;
      items.push({
        runId: run.id,
        kind: 'page',
        sourceKey: page.id,
        sourceFingerprint: page.contentHash,
        displayName: `${page.locale}/${page.path}`,
        targetKey: `${page.locale}/${page.path}`,
        action: 'skip',
        status: 'warning',
        warningCode: 'CROSS_MODE_SKIP',
        warningMessage: `Space "${page.spaceKind}" not available in ${currentMode} mode`,
        metadata: { entry: page.entry, title: page.title, spaceKind: page.spaceKind },
        finishedAt: new Date(),
      });
      continue;
    }
    const existing = await db.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, page.path),
        eq(schema.pages.locale, page.locale),
      ),
    });
    let action: 'create' | 'replace' | 'skip' = existing ? (strategy === 'replace' ? 'replace' : 'skip') : 'create';

    let itemStatus: 'completed' | 'warning' = 'completed';
    let warningCode: string | undefined;
    let warningMessage: string | undefined;

    // Guard: a full-history "replace" clears the target page's existing
    // revisions (see the *WithHistory writers). If that page was not produced
    // by a prior import from this same archive, we cannot tell whether wiping
    // it is safe — skip instead of guessing (mirrors previewWikiJs's guard).
    if (includeHistory && action === 'replace') {
      const mapping = await db.query.transferPageMappings.findFirst({
        where: and(
          eq(schema.transferPageMappings.sourceType, 'archive'),
          eq(schema.transferPageMappings.sourceIdentity, sourceIdentity),
          eq(schema.transferPageMappings.sourcePageKey, page.id),
        ),
      });
      if (!mapping) {
        action = 'skip';
        itemStatus = 'warning';
        warningCode = 'HISTORY_REPLACE_UNMAPPED_PAGE';
        warningMessage = 'A page already exists at this path but was not created by a previous import from this archive; full-history replace was skipped to avoid overwriting unrelated content.';
      }
    }

    let historyMeta: Record<string, unknown> | undefined;
    if (includeHistory && action !== 'skip' && page.historyEntries?.length) {
      historyMeta = {
        totalAvailable: page.historyEntries.length + 1,
        includedCount: page.historyEntries.length + 1,
        limit: historyLimit,
      };
    }

    if (action === 'create') created += 1;
    else if (action === 'replace') replaced += 1;
    else skipped += 1;
    if (itemStatus === 'warning') warnings += 1;
    items.push({
      runId: run.id,
      kind: 'page',
      sourceKey: page.id,
      sourceFingerprint: page.contentHash,
      displayName: `${page.locale}/${page.path}`,
      targetKey: `${page.locale}/${page.path}`,
      action,
      status: itemStatus,
      warningCode,
      warningMessage,
      metadata: { entry: page.entry, title: page.title, ...(historyMeta ? { history: historyMeta } : {}) },
      finishedAt: new Date(),
    });
  }
  for (const asset of inspected.manifest.assets) {
    items.push({
      runId: run.id,
      kind: 'asset',
      sourceKey: asset.id,
      sourceFingerprint: asset.contentHash,
      displayName: asset.entry,
      targetKey: null,
      action: 'create',
      status: 'completed',
      bytesTotal: asset.sizeBytes,
      bytesProcessed: asset.sizeBytes,
      metadata: { entry: asset.entry, contentType: asset.contentType },
      finishedAt: new Date(),
    });
  }
  if (items.length) await db.insert(schema.transferItems).values(items).onConflictDoNothing();
  const totalWarnings = crossModeSkips + warnings;
  const result: Record<string, unknown> = {
    sourceFingerprint: artifact.contentHash,
    totalItems: items.length,
    processedItems: items.length,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
    warningItems: totalWarnings > 0 ? totalWarnings : undefined,
  };
  if (hasModeMismatch) {
    result.warningMessage = `Archive was exported from ${sourceMode} mode; current instance is in ${currentMode} mode. Some content may be skipped.`;
  }
  await markRunTerminal(run.id, hasModeMismatch || totalWarnings > 0 ? 'completed_with_warnings' : 'completed', result);
}

async function flushPreviewItems(
  runId: string,
  items: (typeof schema.transferItems.$inferInsert)[],
  progress: {
    totalItems: number;
    processedItems: number;
    currentItem?: string;
  },
) {
  if (items.length) {
    await db.insert(schema.transferItems).values(items).onConflictDoNothing();
    items.length = 0;
  }
  await db.update(schema.transferRuns).set(progress).where(eq(schema.transferRuns.id, runId));
}

async function previewWikiJs(run: typeof schema.transferRuns.$inferSelect) {
  if (!run.sourceId) throw new Error('Wiki.js source is missing');
  const source = await getRuntimeSource(run.sourceId);
  const client = new WikiJsClient(source.baseUrl, source.apiToken, source.allowPrivateNetwork);
  const inventory = await client.listPages();
  const space = await resolveSpace();
  if (!space) throw new Error('Default space not found');
  const options = run.options as { conflictStrategy?: string; includeHistory?: boolean; historyLimit?: number };
  const strategy = options.conflictStrategy ?? 'skip';
  const includeHistory = Boolean(options.includeHistory);
  const historyLimit = normalizeHistoryLimit(options.historyLimit);

  // Probe history access once, up front, instead of discovering the gap page
  // by page — a missing read:history grant fails the whole run immediately.
  if (includeHistory && inventory.length > 0) {
    await client.assertHistoryAccess(inventory[0]!.id);
  }

  const items: (typeof schema.transferItems.$inferInsert)[] = [];
  const fingerprints: string[] = [];
  let created = 0;
  let replaced = 0;
  let skipped = 0;
  let converted = 0;
  let warnings = 0;

  await db.update(schema.transferRuns).set({ totalItems: inventory.length }).where(eq(schema.transferRuns.id, run.id));

  for (let index = 0; index < inventory.length; index += 1) {
    if (await isRunCancelRequested(run.id)) {
      // Flush the completed batch before recording the terminal state so the
      // report and its counters always agree, including a cancellation between
      // the final item and the next progress update.
      await flushPreviewItems(run.id, items, {
        totalItems: inventory.length,
        processedItems: index,
      });
      await markRunTerminal(run.id, 'cancelled', {
        totalItems: inventory.length,
        processedItems: index,
        createdItems: created,
        replacedItems: replaced,
        skippedItems: skipped,
        convertedItems: converted,
        warningItems: warnings,
      });
      return;
    }
    const summary = inventory[index]!;
    const fingerprint = computeWikiJsPageFingerprint({
        id: summary.id,
        path: summary.path,
        locale: summary.locale,
        title: summary.title,
        contentType: summary.contentType,
        updatedAt: summary.updatedAt,
        tags: summary.tags,
      });

    await db.update(schema.transferRuns).set({
      phase: 'validating',
      currentItem: `${summary.locale}/${summary.path}`,
      processedItems: index,
    }).where(eq(schema.transferRuns.id, run.id));

    const converter = getTransferConverter(summary.contentType, undefined);
    if (!converter) {
      skipped += 1;
      warnings += 1;
      fingerprints.push(fingerprint);
      items.push({
        runId: run.id,
        kind: 'page',
        sourceKey: String(summary.id),
        sourceFingerprint: fingerprint,
        displayName: `${summary.locale}/${summary.path}`,
        targetKey: `${summary.locale}/${summary.path}`,
        action: 'skip',
        status: 'warning',
        warningCode: 'UNSUPPORTED_SOURCE_CONTENT',
        warningMessage: `Unsupported Wiki.js content type: ${summary.contentType ?? 'unknown'}`,
        metadata: { contentType: summary.contentType },
        finishedAt: new Date(),
      });
    } else {
      const isConverted = summary.contentType === 'text/html';
      const existing = await db.query.pages.findFirst({
        where: and(
          eq(schema.pages.spaceId, space.id),
          eq(schema.pages.path, summary.path),
          eq(schema.pages.locale, summary.locale),
        ),
      });
      let targetAction: 'create' | 'replace' | 'skip' = existing
        ? (strategy === 'replace' ? 'replace' : 'skip')
        : 'create';

      let itemStatus: 'completed' | 'warning' = 'completed';
      let warningCode: string | undefined;
      let warningMessage: string | undefined;

      // Guard: a full-history "replace" clears the target page's existing
      // revisions (see writeImportedPageWithHistory). If that page was not
      // produced by a prior import from this same Wiki.js source, we cannot
      // tell whether wiping it is safe — skip instead of guessing.
      if (includeHistory && targetAction === 'replace') {
        const mapping = await db.query.transferPageMappings.findFirst({
          where: and(
            eq(schema.transferPageMappings.sourceType, 'wikijs'),
            eq(schema.transferPageMappings.sourceIdentity, source.id),
            eq(schema.transferPageMappings.sourcePageKey, String(summary.id)),
          ),
        });
        if (!mapping) {
          targetAction = 'skip';
          itemStatus = 'warning';
          warningCode = 'HISTORY_REPLACE_UNMAPPED_PAGE';
          warningMessage = 'A page already exists at this path but was not created by a previous import from this Wiki.js source; full-history replace was skipped to avoid overwriting unrelated content.';
        }
      }

      let itemFingerprint = fingerprint;
      let historyMeta: Record<string, unknown> | undefined;
      if (includeHistory && targetAction !== 'skip') {
        const trail = await client.listHistory(summary.id);
        const { keep, truncated } = selectHistoryWindow(trail, historyLimit);
        itemFingerprint = computeWikiJsHistoryFingerprint(fingerprint, trail);
        historyMeta = {
          totalAvailable: trail.length + 1,
          includedCount: keep.length + 1,
          limit: historyLimit,
          truncated,
        };
        if (truncated) {
          itemStatus = 'warning';
          warningCode = 'WIKIJS_HISTORY_TRUNCATED';
          // keep/trail counts are historical versions only (current is tracked
          // separately) so this reads correctly even when keep is empty (a
          // historyLimit of 1 leaves no room for any historical version).
          const oldestKeptNote = keep.length > 0 ? ` (oldest kept: ${keep[0]!.versionDate})` : '';
          warningMessage = `Kept ${keep.length} of ${trail.length} historical versions plus the current version${oldestKeptNote}.`;
        }
      }
      fingerprints.push(itemFingerprint);

      const displayAction = targetAction === 'skip' ? 'skip' : isConverted ? 'convert' : targetAction;
      if (displayAction === 'create') created += 1;
      else if (displayAction === 'replace') replaced += 1;
      else if (displayAction === 'convert') converted += 1;
      else skipped += 1;
      if (itemStatus === 'warning') warnings += 1;

      items.push({
        runId: run.id,
        kind: 'page',
        sourceKey: String(summary.id),
        sourceFingerprint: itemFingerprint,
        displayName: `${summary.locale}/${summary.path}`,
        targetKey: `${summary.locale}/${summary.path}`,
        action: displayAction,
        status: itemStatus,
        warningCode,
        warningMessage,
        metadata: {
          title: summary.title,
          contentType: summary.contentType,
          editor: undefined,
          converted: isConverted,
          targetAction,
          ...(historyMeta ? { history: historyMeta } : {}),
        },
        finishedAt: new Date(),
      });
    }

    if (items.length >= WIKIJS_PREVIEW_BATCH_SIZE || index === inventory.length - 1) {
      await flushPreviewItems(run.id, items, {
        totalItems: inventory.length,
        processedItems: index + 1,
      });
    }
  }

  // A one-page preview has no next iteration in which to observe a cancel
  // request. Recheck before publishing a completed result, just as the import
  // worker does for its final page.
  if (await isRunCancelRequested(run.id)) {
    await markRunTerminal(run.id, 'cancelled', {
      totalItems: inventory.length,
      processedItems: inventory.length,
      createdItems: created,
      replacedItems: replaced,
      skippedItems: skipped,
      convertedItems: converted,
      warningItems: warnings,
    });
    return;
  }
  const fingerprint = (await import('node:crypto')).createHash('sha256').update(fingerprints.sort().join('\n')).digest('hex');
  await markRunTerminal(run.id, warnings > 0 ? 'completed_with_warnings' : 'completed', {
    sourceFingerprint: fingerprint,
    totalItems: inventory.length,
    processedItems: inventory.length,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
    convertedItems: converted,
    warningItems: warnings,
  });
}

// Runs inside a pg-boss worker, not a Next.js request — there is no
// incremental-cache work store there, so any cached space lookup
// (resolveSpace/getSpaceByKind, which use unstable_cache) would otherwise
// throw "Invariant: incrementalCache missing". Matches the same workaround
// already used by other background jobs (see ai-question.ts, raw-conversations.ts).
export function runTransferPreview(runId: string): Promise<void> {
  return runWithoutDataCache(() => runTransferPreviewWithoutDataCache(runId));
}

async function runTransferPreviewWithoutDataCache(runId: string): Promise<void> {
  const run = await db.query.transferRuns.findFirst({
    where: eq(schema.transferRuns.id, runId),
  });
  if (!run || !['queued', 'running'].includes(run.status)) return;
  if (run.cancelRequested) {
    await markRunTerminal(runId, 'cancelled');
    return;
  }
  // pg-boss may redeliver a job after a worker restart. Claim the run only if
  // it is still active and has not been cancelled; otherwise a stale job could
  // restart a completed preview and overwrite its progress counters.
  const [started] = await db
    .update(schema.transferRuns)
    .set({ status: 'running', phase: 'validating', startedAt: run.startedAt ?? new Date() })
    .where(and(
      eq(schema.transferRuns.id, runId),
      eq(schema.transferRuns.status, run.status),
      eq(schema.transferRuns.cancelRequested, false),
    ))
    .returning();
  if (!started) return;
  try {
    if (started.kind === 'archive_preview') await previewArchive(started);
    else if (started.kind === 'wikijs_preview') await previewWikiJs(started);
    else throw new Error('Unsupported preview kind');
  } catch (error) {
    // A non-DomainError failure (e.g. a plain thrown Error from a missing
    // source/space, or an unexpected exception) has no typed code to report.
    // Fall back per run kind so a Wiki.js preview failure isn't mislabeled as
    // an archive problem, which makes troubleshooting harder.
    const fallbackCode = started.kind === 'wikijs_preview' ? 'WIKIJS_PREVIEW_FAILED' : 'INVALID_ARCHIVE';
    await markRunTerminal(runId, 'failed', {
      errorCode: error instanceof DomainError ? error.code : fallbackCode,
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Preview failed',
    });
  }
}
