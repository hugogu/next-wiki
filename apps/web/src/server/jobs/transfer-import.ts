import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { inspectPortableArchive } from '@/server/transfers/archive-reader';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { parsePage } from '@/server/transfers/manifest';
import { rewriteMarkdownImages, rewriteMarkdownLinks } from '@/server/transfers/markdown-links';
import { writeImportedAsset } from '@/server/services/transfer-asset-writer';
import {
  writeImportedPage,
  writeImportedPageWithHistory,
  writeImportedRawEntry,
  writeImportedRawEntryWithHistory,
  writeImportedGeneratedPage,
  writeImportedGeneratedPageWithHistory,
} from '@/server/services/transfer-page-writer';
import { isRunCancelRequested, markRunPaused, markRunTerminal, readRunControlSignal } from '@/server/services/transfers';
import { getRuntimeSource } from '@/server/services/transfer-sources';
import {
  WikiJsClient,
  computeWikiJsHistoryFingerprint,
  normalizeHistoryLimit,
  selectHistoryWindow,
  wikiJsTagNames,
  type WikiJsHistoryEntry,
} from '@/server/transfers/wikijs-client';
import { getTransferConverter } from '@/server/transfers/registry';
import { findMarkdownImages } from '@/server/transfers/markdown-links';
import { localizeWikiJsImage } from '@/server/services/transfer-wikijs-assets';
import { createWikiJsLinkReplacer } from '@/server/transfers/markdown-links';
import { patchMetadata } from '@/server/services/page-metadata';
import { notifyPublicContentChanged } from '@/server/services/public-content-events';
import { getSpaceByKind } from '@/server/services/spaces';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import type { NormalizedPortableManifest } from '@next-wiki/shared';

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

async function runArchiveImport(run: typeof schema.transferRuns.$inferSelect) {
  const preview = run.previewRunId
    ? await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.previewRunId) })
    : null;
  const artifact = run.sourceArtifactId
    ? await db.query.transferArtifacts.findFirst({ where: eq(schema.transferArtifacts.id, run.sourceArtifactId) })
    : null;
  if (!preview || !artifact || artifact.status !== 'ready') throw new Error('Import source is unavailable');
  if (preview.sourceFingerprint !== artifact.contentHash) throw new Error('Preview is stale');
  const inspected = await inspectPortableArchive(transferArtifactStore.pathFor(artifact.storageKey));
  const sourceIdentity = artifact.contentHash ?? artifact.id;
  const includeHistory = Boolean((preview.options as { includeHistory?: boolean }).includeHistory);
  const assetTargets = new Map<string, string>();
  // Keyed by the manifest's hashed asset id (not the zip entry path) — raw
  // history entries reference their original-bytes asset this way.
  const assetTargetsById = new Map<string, string>();
  const kinds = await availableKinds();

  for (const asset of inspected.manifest.assets) {
    const existing = await db.query.transferAssetMappings.findFirst({
      where: and(
        eq(schema.transferAssetMappings.sourceType, 'archive'),
        eq(schema.transferAssetMappings.sourceIdentity, sourceIdentity),
        eq(schema.transferAssetMappings.sourceAssetKey, asset.id),
      ),
    });
    if (existing) {
      assetTargets.set(asset.entry, existing.targetAssetId);
      assetTargetsById.set(asset.id, existing.targetAssetId);
      continue;
    }
    const bytes = await inspected.readEntry(asset.entry);
    const target = await writeImportedAsset({
      bytes,
      contentType: asset.contentType,
      actorUserId: run.actorUserId,
    });
    assetTargets.set(asset.entry, target.id);
    assetTargetsById.set(asset.id, target.id);
    await db.insert(schema.transferAssetMappings).values({
      sourceType: 'archive',
      sourceIdentity,
      sourceAssetKey: asset.id,
      sourceFingerprint: asset.contentHash,
      targetAssetId: target.id,
      lastRunId: run.id,
    }).onConflictDoUpdate({
      target: [
        schema.transferAssetMappings.sourceType,
        schema.transferAssetMappings.sourceIdentity,
        schema.transferAssetMappings.sourceAssetKey,
      ],
      set: { targetAssetId: target.id, sourceFingerprint: asset.contentHash, lastRunId: run.id, updatedAt: new Date() },
    });
  }

  const previewItems = await db.query.transferItems.findMany({
    where: and(eq(schema.transferItems.runId, preview.id), eq(schema.transferItems.kind, 'page')),
  });
  let created = 0;
  let replaced = 0;
  let skipped = 0;
  let crossModeSkips = 0;
  let processed = inspected.manifest.assets.length;
  for (const page of inspected.manifest.pages) {
    const plan = previewItems.find((item) => item.sourceKey === page.id);
    const action = (plan?.action ?? 'skip') as 'create' | 'replace' | 'skip';
    if (await isRunCancelRequested(run.id)) break;

    if (!kinds.has(page.spaceKind)) {
      skipped += 1;
      crossModeSkips += 1;
      processed += 1;
      await db.insert(schema.transferItems).values({
        runId: run.id,
        kind: 'page',
        sourceKey: page.id,
        sourceFingerprint: page.contentHash,
        displayName: `${page.locale}/${page.path}`,
        action: 'skip',
        status: 'warning',
        warningCode: 'CROSS_MODE_SKIP',
        warningMessage: `Space "${page.spaceKind}" not available in current writing mode; skipping import`,
        metadata: { entry: page.entry, spaceKind: page.spaceKind },
        finishedAt: new Date(),
      }).onConflictDoNothing();
      continue;
    }

    const bytes = await inspected.readEntry(page.entry);
    const parsed = parsePage(bytes.toString('utf8'));
    const rewriteImages = (entry: string, markdown: string) =>
      rewriteMarkdownImages(markdown, (url) => {
        const clean = url.split(/[?#]/)[0]!;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry), clean));
        const targetId = assetTargets.get(resolved);
        return targetId ? `/api/assets/${targetId}` : null;
      });
    const markdown = page.spaceKind === 'raw' ? parsed.markdown : rewriteImages(page.entry, parsed.markdown);
    let writeResult: { pageId: string | null; revisionId: string | null; action: 'create' | 'replace' | 'skip' };
    const historyMeta: Record<string, unknown> | undefined =
      includeHistory && action !== 'skip' && page.historyEntries?.length
        ? { totalAvailable: page.historyEntries.length + 1, includedCount: page.historyEntries.length + 1 }
        : undefined;

    if (historyMeta && page.historyEntries) {
      const historyVersions = await Promise.all(
        page.historyEntries.map(async (historyEntry) => {
          const historyBytes = await inspected.readEntry(historyEntry.entry);
          const historyParsed = parsePage(historyBytes.toString('utf8'));
          const historyMarkdown = page.spaceKind === 'raw'
            ? historyParsed.markdown
            : rewriteImages(historyEntry.entry, historyParsed.markdown);
          return { entry: historyEntry, frontmatter: historyParsed.frontmatter, markdown: historyMarkdown };
        }),
      );
      if (page.spaceKind === 'raw') {
        const versions = [
          ...historyVersions.map((v) => ({
            body: v.markdown,
            contentType: v.entry.contentType ?? 'text/plain',
            createdAt: new Date(v.entry.publishedAt),
            sourceMetadata: {
              archiveAuthorEmail: v.entry.authorEmail,
              archiveAuthorDisplayName: v.entry.authorDisplayName,
              archiveVersionNumber: v.entry.versionNumber,
              isCurrent: false,
            },
            originalAssetId: v.entry.originalAssetId ? assetTargetsById.get(v.entry.originalAssetId) ?? null : null,
          })),
          {
            body: markdown,
            contentType: parsed.frontmatter.contentType,
            createdAt: page.publishedAt ? new Date(page.publishedAt) : new Date(page.createdAt),
            sourceMetadata: {
              ...(parsed.frontmatter.inputKind ? { inputKind: parsed.frontmatter.inputKind } : {}),
              ...(parsed.frontmatter.rawSource ?? {}),
              isCurrent: true,
            },
            originalAssetId: null,
          },
        ];
        const result = await writeImportedRawEntryWithHistory({
          actorUserId: run.actorUserId!,
          path: page.path,
          locale: page.locale,
          title: page.title,
          versions,
          action,
        });
        writeResult = { pageId: result.pageId, revisionId: result.revisionIds.at(-1) ?? null, action: result.action };
      } else if (page.spaceKind === 'generated') {
        const versions = [
          ...historyVersions.map((v) => ({
            markdown: v.markdown,
            title: v.frontmatter.title,
            createdAt: new Date(v.entry.publishedAt),
          })),
          {
            markdown,
            title: page.title,
            createdAt: page.publishedAt ? new Date(page.publishedAt) : new Date(page.createdAt),
          },
        ];
        const result = await writeImportedGeneratedPageWithHistory({
          actorUserId: run.actorUserId!,
          path: page.path,
          locale: page.locale,
          versions,
          action,
        });
        writeResult = { pageId: result.pageId, revisionId: result.revisionIds.at(-1) ?? null, action: result.action };
      } else {
        const versions = [
          ...historyVersions.map((v) => ({
            markdown: v.markdown,
            title: v.frontmatter.title,
            createdAt: new Date(v.entry.publishedAt),
            sourceMetadata: {
              archiveAuthorEmail: v.entry.authorEmail,
              archiveAuthorDisplayName: v.entry.authorDisplayName,
              archiveVersionNumber: v.entry.versionNumber,
              isCurrent: false,
            },
          })),
          {
            markdown,
            title: page.title,
            createdAt: page.publishedAt ? new Date(page.publishedAt) : new Date(page.createdAt),
            sourceMetadata: { isCurrent: true },
          },
        ];
        const result = await writeImportedPageWithHistory({
          actorUserId: run.actorUserId!,
          path: page.path,
          locale: page.locale,
          versions,
          action,
        });
        writeResult = { pageId: result.pageId, revisionId: result.revisionIds.at(-1) ?? null, action: result.action };
      }
    } else if (page.spaceKind === 'raw') {
      writeResult = await writeImportedRawEntry({
        actorUserId: run.actorUserId!,
        page: {
          path: page.path,
          locale: page.locale,
          title: page.title,
          body: markdown,
          contentType: parsed.frontmatter.contentType,
          inputKind: parsed.frontmatter.inputKind,
          rawSource: parsed.frontmatter.rawSource,
        },
        action,
      });
    } else if (page.spaceKind === 'generated') {
      writeResult = await writeImportedGeneratedPage({
        actorUserId: run.actorUserId!,
        page: {
          path: page.path,
          locale: page.locale,
          title: page.title,
          body: markdown,
        },
        action,
      });
    } else {
      writeResult = await writeImportedPage({
        actorUserId: run.actorUserId!,
        path: page.path,
        locale: page.locale,
        title: page.title,
        markdown,
        action,
      });
    }
    if (writeResult.action === 'create') created += 1;
    else if (writeResult.action === 'replace') replaced += 1;
    else skipped += 1;
    processed += 1;
    if (writeResult.pageId) {
      await db.insert(schema.transferPageMappings).values({
        sourceType: 'archive',
        sourceIdentity,
        sourcePageKey: page.id,
        sourceFingerprint: page.contentHash,
        targetPageId: writeResult.pageId,
        targetPath: page.path,
        targetLocale: page.locale,
        lastRunId: run.id,
      }).onConflictDoUpdate({
        target: [
          schema.transferPageMappings.sourceType,
          schema.transferPageMappings.sourceIdentity,
          schema.transferPageMappings.sourcePageKey,
        ],
        set: {
          sourceFingerprint: page.contentHash,
          targetPageId: writeResult.pageId,
          targetPath: page.path,
          targetLocale: page.locale,
          lastRunId: run.id,
          updatedAt: new Date(),
        },
      });
    }
    await db.insert(schema.transferItems).values({
      runId: run.id,
      kind: 'page',
      sourceKey: page.id,
      sourceFingerprint: page.contentHash,
      displayName: `${page.locale}/${page.path}`,
      targetKey: writeResult.pageId,
      action: writeResult.action,
      status: 'completed',
      metadata: { entry: page.entry, ...(historyMeta ? { history: historyMeta } : {}) },
      finishedAt: new Date(),
    }).onConflictDoNothing();
    await db.update(schema.transferRuns).set({
      phase: 'writing_pages',
      currentItem: `${page.locale}/${page.path}`,
      processedItems: processed,
      createdItems: created,
      replacedItems: replaced,
      skippedItems: skipped,
    }).where(eq(schema.transferRuns.id, run.id));
  }
  const latest = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.id) });
  const wasCancelled = latest?.cancelRequested;
  const status = wasCancelled ? 'cancelled'
    : crossModeSkips > 0 ? 'completed_with_warnings'
    : 'completed';
  await markRunTerminal(run.id, status, {
    totalItems: inspected.manifest.pages.length + inspected.manifest.assets.length,
    processedItems: processed,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
    warningItems: crossModeSkips > 0 ? crossModeSkips : undefined,
  });
  if (processed > 0 && !wasCancelled) {
    await notifyPublicContentChanged('manual');
  }
}

async function runWikiJsImport(run: typeof schema.transferRuns.$inferSelect) {
  if (!run.previewRunId || !run.sourceId || !run.actorUserId) throw new Error('Wiki.js import is incomplete');
  const preview = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.previewRunId) });
  if (!preview) throw new Error('Wiki.js preview is missing');
  const source = await getRuntimeSource(run.sourceId);
  const client = new WikiJsClient(source.baseUrl, source.apiToken, source.allowPrivateNetwork);
  const runOptions = run.options as { includeHistory?: boolean; historyLimit?: number };
  const includeHistory = Boolean(runOptions.includeHistory);
  const historyLimit = normalizeHistoryLimit(runOptions.historyLimit);
  const plans = await db.query.transferItems.findMany({
    where: and(eq(schema.transferItems.runId, preview.id), eq(schema.transferItems.kind, 'page')),
  });
  // Resume support: continue counters from the run's persisted progress and
  // skip pages already imported in an earlier (paused) segment of this run.
  let created = run.createdItems;
  let replaced = run.replacedItems;
  let skipped = run.skippedItems;
  let converted = run.convertedItems;
  let warnings = run.warningItems;
  let failed = run.failedItems;
  let processed = run.processedItems;
  let cancelled = false;
  let paused = false;
  const doneKeys = new Set(
    (
      await db.query.transferItems.findMany({
        where: and(eq(schema.transferItems.runId, run.id), eq(schema.transferItems.kind, 'page')),
        columns: { sourceKey: true },
      })
    ).map((item) => item.sourceKey),
  );

  await db.update(schema.transferRuns).set({
    totalItems: plans.length,
    phase: 'writing_pages',
  }).where(eq(schema.transferRuns.id, run.id));

  async function reportProgress(currentItem: string) {
    await db.update(schema.transferRuns).set({
      phase: 'writing_pages',
      currentItem,
      processedItems: processed,
      createdItems: created,
      replacedItems: replaced,
      skippedItems: skipped,
      convertedItems: converted,
      warningItems: warnings,
      failedItems: failed,
    }).where(eq(schema.transferRuns.id, run.id));
  }

  // Convert one Wiki.js content blob (current or historical) into localized,
  // link-rewritten markdown. Shared by both the single-version and
  // full-history write paths so every version goes through the same
  // conversion/link/image/tag pipeline. Returns null for unsupported content
  // types. Image failures are non-fatal — the link is left as-is and the
  // outer `warnings` counter is bumped.
  async function processWikiJsContent(input: {
    content: string;
    contentType?: string | null;
    editor?: string | null;
    tags?: (string | { tag: string; title?: string })[];
    title: string;
    pagePath: string;
  }): Promise<{ markdown: string; converted: boolean } | null> {
    const converter = getTransferConverter(input.contentType, input.editor);
    if (!converter) return null;
    const conversion = converter(input.content);
    let markdown = conversion.markdown;
    // Wiki.js content may contain internal page links with locale routing
    // prefixes (e.g. `/zh/docs/foo` or `https://wiki.host/zh/docs/foo`).
    // next-wiki stores locale as page metadata, so strip the prefix from the
    // same-origin/internal links while leaving external URLs untouched.
    markdown = rewriteMarkdownLinks(markdown, createWikiJsLinkReplacer(source.baseUrl, input.pagePath));
    const images = findMarkdownImages(markdown).sort((a, b) => b.start - a.start);
    for (const image of images) {
      try {
        const localUrl = await localizeWikiJsImage({
          sourceId: source.id,
          baseUrl: source.baseUrl,
          apiToken: source.apiToken,
          allowPrivateNetwork: source.allowPrivateNetwork,
          pagePath: input.pagePath,
          imageUrl: image.url,
          actorUserId: run.actorUserId!,
          runId: run.id,
        });
        markdown = `${markdown.slice(0, image.start)}${localUrl}${markdown.slice(image.end)}`;
      } catch {
        warnings += 1;
      }
    }
    if (input.tags !== undefined) {
      markdown = patchMetadata(markdown, { tags: wikiJsTagNames(input.tags) }, input.title).source;
    }
    return { markdown, converted: conversion.converted };
  }

  for (const plan of plans) {
    // Already imported in an earlier segment of this (resumed) run — skip in
    // memory before any DB/network work so counters are never double-counted.
    if (doneKeys.has(plan.sourceKey)) continue;
    // Poll the live control flag before touching the network or writing a page,
    // so Cancel/Pause take effect promptly instead of running to the end.
    const control = await readRunControlSignal(run.id);
    if (control === 'cancel') {
      cancelled = true;
      break;
    }
    if (control === 'pause') {
      paused = true;
      break;
    }
    if (plan.warningCode === 'UNSUPPORTED_SOURCE_CONTENT') {
      skipped += 1;
      warnings += 1;
      processed += 1;
      // Record the skip as an item so a later resume does not re-count it.
      await db.insert(schema.transferItems).values({
        runId: run.id,
        kind: 'page',
        sourceKey: plan.sourceKey,
        sourceFingerprint: plan.sourceFingerprint,
        displayName: plan.displayName,
        action: 'skip',
        status: 'warning',
        warningCode: 'UNSUPPORTED_SOURCE_CONTENT',
        metadata: {},
        finishedAt: new Date(),
      }).onConflictDoNothing();
      doneKeys.add(plan.sourceKey);
      await reportProgress(plan.displayName);
      continue;
    }
    // A single page's fetch/verify/write failing (stale fingerprint, a
    // transient Wiki.js network error, etc.) must not abort the rest of a
    // large batch. Record it as a failed item and move on instead of letting
    // the exception bubble up to runTransferImport's top-level catch, which
    // would mark the *entire* run failed and skip notifyPublicContentChanged
    // for every page already written before the failure.
    try {
      await processPage(plan);
    } catch (error) {
      failed += 1;
      processed += 1;
      await db.insert(schema.transferItems).values({
        runId: run.id,
        kind: 'page',
        sourceKey: plan.sourceKey,
        sourceFingerprint: plan.sourceFingerprint,
        displayName: plan.displayName,
        action: 'skip',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Import failed',
        metadata: {},
        finishedAt: new Date(),
      }).onConflictDoNothing();
      doneKeys.add(plan.sourceKey);
      await reportProgress(plan.displayName);
    }
  }

  // The operator can cancel while the final page is being fetched, converted,
  // or written. There is no subsequent loop iteration in that case, so poll
  // once more before choosing the terminal status. This is especially common
  // for a one-page import that includes a long Wiki.js revision history.
  if (!cancelled && !paused) {
    const control = await readRunControlSignal(run.id);
    cancelled = control === 'cancel';
    paused = control === 'pause';
  }

  async function processPage(plan: typeof schema.transferItems.$inferSelect): Promise<void> {
    const page = await client.getPage(Number(plan.sourceKey));
    const converter = getTransferConverter(page.contentType, page.editor);
    if (!converter) return;

    const targetActionMeta = (plan.metadata as { targetAction?: string }).targetAction;
    const writeAction = targetActionMeta === 'replace' ? 'replace' : targetActionMeta === 'skip' ? 'skip' : 'create';

    // Only re-fetch/verify the history trail for pages that will actually be
    // written — matches previewWikiJs, which likewise skips history for
    // 'skip' items, so `plan.sourceFingerprint` lines up with what we
    // recompute here.
    let trail: WikiJsHistoryEntry[] = [];
    let expectedFingerprint = page.fingerprint;
    if (includeHistory && writeAction !== 'skip') {
      trail = await client.listHistory(page.id);
      expectedFingerprint = computeWikiJsHistoryFingerprint(page.fingerprint, trail);
    }
    if (expectedFingerprint !== plan.sourceFingerprint) {
      throw new Error(`Wiki.js page changed after preview: ${page.path}`);
    }

    let writePageId: string | null;
    let writeResultAction: 'create' | 'replace' | 'skip';
    let anyConverted = false;
    let itemWarned = false;
    let historyTruncated = false;
    let historyIncludedCount = 0;
    let historyTotalAvailable = 0;
    // Historical-only counts (excluding the current version) for the
    // human-readable warning message — historyIncludedCount/historyTotalAvailable
    // above include the current version and are kept that way for the
    // structured metadata, matching previewWikiJs's history metadata shape.
    let historyKeptCount = 0;
    let historyAvailableCount = 0;

    if (includeHistory) {
      const { keep, truncated } = selectHistoryWindow(trail, historyLimit);
      const versions: Array<{ markdown: string; title: string; createdAt: Date; sourceMetadata: Record<string, unknown> }> = [];
      for (const entry of keep) {
        const versionContent = await client.getVersion(page.id, entry.versionId);
        const built = await processWikiJsContent({
          content: versionContent.content,
          contentType: versionContent.contentType,
          tags: versionContent.tags ?? undefined,
          title: versionContent.title,
          pagePath: versionContent.path,
        });
        if (!built) {
          itemWarned = true;
          continue;
        }
        if (built.converted) anyConverted = true;
        versions.push({
          markdown: built.markdown,
          title: versionContent.title,
          createdAt: new Date(versionContent.versionDate),
          sourceMetadata: {
            wikijsVersionId: entry.versionId,
            wikijsAuthorId: entry.authorId,
            wikijsAuthorName: entry.authorName,
            actionType: entry.actionType,
            isCurrent: false,
          },
        });
      }
      const currentBuilt = await processWikiJsContent({
        content: page.content,
        contentType: page.contentType,
        editor: page.editor,
        tags: page.tags,
        title: page.title,
        pagePath: page.path,
      });
      if (!currentBuilt) return;
      if (currentBuilt.converted) anyConverted = true;
      versions.push({
        markdown: currentBuilt.markdown,
        title: page.title,
        createdAt: page.updatedAt ? new Date(page.updatedAt) : new Date(),
        sourceMetadata: {
          wikijsAuthorName: page.authorName ?? null,
          wikijsCreatorName: page.creatorName ?? null,
          isCurrent: true,
        },
      });

      const result = await writeImportedPageWithHistory({
        actorUserId: run.actorUserId!,
        path: page.path,
        locale: page.locale,
        versions,
        action: writeAction,
      });
      writePageId = result.pageId;
      writeResultAction = result.action;
      historyTruncated = truncated;
      historyIncludedCount = versions.length;
      historyTotalAvailable = trail.length + 1;
      historyKeptCount = keep.length;
      historyAvailableCount = trail.length;
      if (truncated) itemWarned = true;
    } else {
      const built = await processWikiJsContent({
        content: page.content,
        contentType: page.contentType,
        editor: page.editor,
        tags: page.tags,
        title: page.title,
        pagePath: page.path,
      });
      if (!built) return;
      anyConverted = built.converted;
      const result = await writeImportedPage({
        actorUserId: run.actorUserId!,
        path: page.path,
        locale: page.locale,
        title: page.title,
        markdown: built.markdown,
        action: writeAction,
      });
      writePageId = result.pageId;
      writeResultAction = result.action;
    }

    if (writeResultAction === 'create') created += 1;
    else if (writeResultAction === 'replace') replaced += 1;
    else skipped += 1;
    if (anyConverted) converted += 1;
    if (itemWarned) warnings += 1;
    processed += 1;
    await reportProgress(`${page.locale}/${page.path}`);
    if (writePageId) {
      await db.insert(schema.transferPageMappings).values({
        sourceType: 'wikijs',
        sourceIdentity: source.id,
        sourcePageKey: String(page.id),
        sourceFingerprint: expectedFingerprint,
        targetPageId: writePageId,
        targetPath: page.path,
        targetLocale: page.locale,
        lastRunId: run.id,
      }).onConflictDoUpdate({
        target: [
          schema.transferPageMappings.sourceType,
          schema.transferPageMappings.sourceIdentity,
          schema.transferPageMappings.sourcePageKey,
        ],
        set: {
          sourceFingerprint: expectedFingerprint,
          targetPageId: writePageId,
          targetPath: page.path,
          targetLocale: page.locale,
          lastRunId: run.id,
          updatedAt: new Date(),
        },
      });
    }
    await db.insert(schema.transferItems).values({
      runId: run.id,
      kind: 'page',
      sourceKey: String(page.id),
      sourceFingerprint: expectedFingerprint,
      displayName: `${page.locale}/${page.path}`,
      targetKey: writePageId,
      action: anyConverted ? 'convert' : writeResultAction,
      status: itemWarned ? 'warning' : 'completed',
      warningCode: historyTruncated ? 'WIKIJS_HISTORY_TRUNCATED' : undefined,
      warningMessage: historyTruncated
        ? `Kept ${historyKeptCount} of ${historyAvailableCount} historical versions plus the current version.`
        : undefined,
      metadata: {
        converted: anyConverted,
        ...(includeHistory
          ? { history: { totalAvailable: historyTotalAvailable, includedCount: historyIncludedCount, limit: historyLimit, truncated: historyTruncated } }
          : {}),
      },
      finishedAt: new Date(),
    }).onConflictDoNothing();
  }
  if (paused) {
    // Progress counters were persisted incrementally; just flip to paused and
    // keep the mutation slot so the run can be resumed later.
    await markRunPaused(run.id);
    return;
  }
  await markRunTerminal(
    run.id,
    cancelled ? 'cancelled' : warnings || failed ? 'completed_with_warnings' : 'completed',
    {
      totalItems: plans.length,
      processedItems: processed,
      createdItems: created,
      replacedItems: replaced,
      skippedItems: skipped,
      convertedItems: converted,
      warningItems: warnings,
      failedItems: failed,
    },
  );
  // One full snapshot sync at the end is enough; do not enqueue per page.
  // Skip it on cancellation — a partial import shouldn't trigger a git commit.
  if (processed > 0 && !cancelled) {
    await notifyPublicContentChanged('manual');
  }
}

// Runs inside a pg-boss worker, not a Next.js request — there is no
// incremental-cache work store there, so any cached space lookup
// (resolveSpace/getSpaceByKind, which use unstable_cache) would otherwise
// throw "Invariant: incrementalCache missing". Matches the same workaround
// already used by other background jobs (see ai-question.ts, raw-conversations.ts).
export function runTransferImport(runId: string): Promise<void> {
  return runWithoutDataCache(() => runTransferImportWithoutDataCache(runId));
}

async function runTransferImportWithoutDataCache(runId: string): Promise<void> {
  const run = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
  if (!run || !['queued', 'running'].includes(run.status) || run.cancelRequested) return;
  // Do not revive a run that was cancelled while its pg-boss job was waiting.
  // The condition also protects the hand-off between a queued cancellation and
  // the worker claiming the job.
  const [started] = await db.update(schema.transferRuns).set({
    status: 'running',
    phase: 'writing_assets',
    startedAt: run.startedAt ?? new Date(),
  }).where(and(
    eq(schema.transferRuns.id, runId),
    eq(schema.transferRuns.status, run.status),
    eq(schema.transferRuns.cancelRequested, false),
  )).returning();
  if (!started) return;
  try {
    if (started.kind === 'archive_import') await runArchiveImport(started);
    else if (started.kind === 'wikijs_import') await runWikiJsImport(started);
    else throw new Error('Unsupported import kind');
  } catch (error) {
    await markRunTerminal(runId, 'failed', {
      errorCode: 'IMPORT_FAILED',
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Import failed',
    });
  }
}
