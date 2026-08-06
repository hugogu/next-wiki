import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { inspectPortableArchive } from '@/server/transfers/archive-reader';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { parsePage } from '@/server/transfers/manifest';
import { markRunTerminal } from '@/server/services/transfers';
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
  const strategy = (run.options as { conflictStrategy?: string }).conflictStrategy ?? 'skip';
  const currentMode = await getMode();
  const sourceMode = inspected.manifest.source.writingMode;
  const hasModeMismatch = sourceMode !== currentMode;
  const kinds = await availableKinds();

  let created = 0;
  let replaced = 0;
  let skipped = 0;
  let crossModeSkips = 0;
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
    const action = existing ? (strategy === 'replace' ? 'replace' : 'skip') : 'create';
    if (action === 'create') created += 1;
    else if (action === 'replace') replaced += 1;
    else skipped += 1;
    items.push({
      runId: run.id,
      kind: 'page',
      sourceKey: page.id,
      sourceFingerprint: page.contentHash,
      displayName: `${page.locale}/${page.path}`,
      targetKey: `${page.locale}/${page.path}`,
      action,
      status: 'completed',
      metadata: { entry: page.entry, title: page.title },
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
  const result: Record<string, unknown> = {
    sourceFingerprint: artifact.contentHash,
    totalItems: items.length,
    processedItems: items.length,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
    warningItems: crossModeSkips > 0 ? crossModeSkips : undefined,
  };
  if (hasModeMismatch) {
    result.warningMessage = `Archive was exported from ${sourceMode} mode; current instance is in ${currentMode} mode. Some content may be skipped.`;
  }
  await markRunTerminal(run.id, hasModeMismatch || crossModeSkips > 0 ? 'completed_with_warnings' : 'completed', result);
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

export async function runTransferPreview(runId: string): Promise<void> {
  const run = await db.query.transferRuns.findFirst({
    where: eq(schema.transferRuns.id, runId),
  });
  if (!run) return;
  await db
    .update(schema.transferRuns)
    .set({ status: 'running', phase: 'validating', startedAt: run.startedAt ?? new Date() })
    .where(eq(schema.transferRuns.id, runId));
  try {
    if (run.kind === 'archive_preview') await previewArchive(run);
    else if (run.kind === 'wikijs_preview') await previewWikiJs(run);
    else throw new Error('Unsupported preview kind');
  } catch (error) {
    // A non-DomainError failure (e.g. a plain thrown Error from a missing
    // source/space, or an unexpected exception) has no typed code to report.
    // Fall back per run kind so a Wiki.js preview failure isn't mislabeled as
    // an archive problem, which makes troubleshooting harder.
    const fallbackCode = run.kind === 'wikijs_preview' ? 'WIKIJS_PREVIEW_FAILED' : 'INVALID_ARCHIVE';
    await markRunTerminal(runId, 'failed', {
      errorCode: error instanceof DomainError ? error.code : fallbackCode,
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Preview failed',
    });
  }
}
