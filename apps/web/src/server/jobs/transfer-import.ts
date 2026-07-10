import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { inspectPortableArchive } from '@/server/transfers/archive-reader';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { parsePage } from '@/server/transfers/manifest';
import { rewriteMarkdownImages, rewriteMarkdownLinks } from '@/server/transfers/markdown-links';
import { writeImportedAsset } from '@/server/services/transfer-asset-writer';
import { writeImportedPage } from '@/server/services/transfer-page-writer';
import { isRunCancelRequested, markRunTerminal } from '@/server/services/transfers';
import { getRuntimeSource } from '@/server/services/transfer-sources';
import { WikiJsClient } from '@/server/transfers/wikijs-client';
import { getTransferConverter } from '@/server/transfers/registry';
import { findMarkdownImages } from '@/server/transfers/markdown-links';
import { localizeWikiJsImage } from '@/server/services/transfer-wikijs-assets';
import { createWikiJsLinkReplacer } from '@/server/transfers/markdown-links';
import { enqueueGitExport } from '@/server/services/git-export';

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
  const assetTargets = new Map<string, string>();

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
      continue;
    }
    const bytes = await inspected.readEntry(asset.entry);
    const target = await writeImportedAsset({
      bytes,
      contentType: asset.contentType,
      actorUserId: run.actorUserId,
    });
    assetTargets.set(asset.entry, target.id);
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
  let processed = inspected.manifest.assets.length;
  for (const page of inspected.manifest.pages) {
    const plan = previewItems.find((item) => item.sourceKey === page.id);
    const action = (plan?.action ?? 'skip') as 'create' | 'replace' | 'skip';
    // `run` is a snapshot from job start; poll the live flag so cancelling
    // mid-import actually stops it rather than only fixing the final status.
    if (await isRunCancelRequested(run.id)) break;
    const bytes = await inspected.readEntry(page.entry);
    const parsed = parsePage(bytes.toString('utf8'));
    const markdown = rewriteMarkdownImages(parsed.markdown, (url) => {
      const clean = url.split(/[?#]/)[0]!;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page.entry), clean));
      const targetId = assetTargets.get(resolved);
      return targetId ? `/api/assets/${targetId}` : null;
    });
    const result = await writeImportedPage({
      actorUserId: run.actorUserId!,
      path: page.path,
      locale: page.locale,
      title: page.title,
      markdown,
      action,
    });
    if (result.action === 'create') created += 1;
    else if (result.action === 'replace') replaced += 1;
    else skipped += 1;
    processed += 1;
    if (result.pageId) {
      await db.insert(schema.transferPageMappings).values({
        sourceType: 'archive',
        sourceIdentity,
        sourcePageKey: page.id,
        sourceFingerprint: page.contentHash,
        targetPageId: result.pageId,
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
          targetPageId: result.pageId,
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
      targetKey: result.pageId,
      action: result.action,
      status: 'completed',
      metadata: { entry: page.entry },
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
  await markRunTerminal(run.id, latest?.cancelRequested ? 'cancelled' : 'completed', {
    totalItems: inspected.manifest.pages.length + inspected.manifest.assets.length,
    processedItems: processed,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
  });
  // A full snapshot export reconciles every imported page; one sync at the end
  // is sufficient and avoids a git commit per page.
  if (processed > 0 && !latest?.cancelRequested) {
    await enqueueGitExport('manual');
  }
}

async function runWikiJsImport(run: typeof schema.transferRuns.$inferSelect) {
  if (!run.previewRunId || !run.sourceId || !run.actorUserId) throw new Error('Wiki.js import is incomplete');
  const preview = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.previewRunId) });
  if (!preview) throw new Error('Wiki.js preview is missing');
  const source = await getRuntimeSource(run.sourceId);
  const client = new WikiJsClient(source.baseUrl, source.apiToken, source.allowPrivateNetwork);
  const plans = await db.query.transferItems.findMany({
    where: and(eq(schema.transferItems.runId, preview.id), eq(schema.transferItems.kind, 'page')),
  });
  let created = 0;
  let replaced = 0;
  let skipped = 0;
  let converted = 0;
  let warnings = 0;
  let processed = 0;
  let cancelled = false;

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
    }).where(eq(schema.transferRuns.id, run.id));
  }

  for (const plan of plans) {
    // Poll the live cancel flag before touching the network or writing a page,
    // so "Cancel Run" stops the import promptly instead of running to the end.
    if (await isRunCancelRequested(run.id)) {
      cancelled = true;
      break;
    }
    if (plan.warningCode === 'UNSUPPORTED_SOURCE_CONTENT') {
      skipped += 1;
      warnings += 1;
      processed += 1;
      await reportProgress(plan.displayName);
      continue;
    }
    const page = await client.getPage(Number(plan.sourceKey));
    if (page.fingerprint !== plan.sourceFingerprint) throw new Error(`Wiki.js page changed after preview: ${page.path}`);
    const converter = getTransferConverter(page.contentType, page.editor);
    if (!converter) continue;
    const conversion = converter(page.content);
    let markdown = conversion.markdown;
    // Wiki.js content may contain internal page links with locale routing
    // prefixes (e.g. `/zh/docs/foo` or `https://wiki.host/zh/docs/foo`).
    // next-wiki stores locale as page metadata, so strip the prefix from the
    // same-origin/internal links while leaving external URLs untouched.
    markdown = rewriteMarkdownLinks(markdown, createWikiJsLinkReplacer(source.baseUrl));
    const images = findMarkdownImages(markdown).sort((a, b) => b.start - a.start);
    for (const image of images) {
      try {
        const localUrl = await localizeWikiJsImage({
          sourceId: source.id,
          baseUrl: source.baseUrl,
          apiToken: source.apiToken,
          allowPrivateNetwork: source.allowPrivateNetwork,
          pagePath: page.path,
          imageUrl: image.url,
          actorUserId: run.actorUserId,
          runId: run.id,
        });
        markdown = `${markdown.slice(0, image.start)}${localUrl}${markdown.slice(image.end)}`;
      } catch {
        warnings += 1;
      }
    }
    const targetAction = (plan.metadata as { targetAction?: string }).targetAction;
    const action = targetAction === 'replace' ? 'replace' : targetAction === 'skip' ? 'skip' : 'create';
    const result = await writeImportedPage({
      actorUserId: run.actorUserId,
      path: page.path,
      locale: page.locale,
      title: page.title,
      markdown,
      action,
    });
    if (result.action === 'create') created += 1;
    else if (result.action === 'replace') replaced += 1;
    else skipped += 1;
    if (conversion.converted) converted += 1;
    processed += 1;
    await reportProgress(`${page.locale}/${page.path}`);
    if (result.pageId) {
      await db.insert(schema.transferPageMappings).values({
        sourceType: 'wikijs',
        sourceIdentity: source.id,
        sourcePageKey: String(page.id),
        sourceFingerprint: page.fingerprint,
        targetPageId: result.pageId,
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
          sourceFingerprint: page.fingerprint,
          targetPageId: result.pageId,
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
      sourceFingerprint: page.fingerprint,
      displayName: `${page.locale}/${page.path}`,
      targetKey: result.pageId,
      action: conversion.converted ? 'convert' : result.action,
      status: warnings ? 'warning' : 'completed',
      metadata: { converted: conversion.converted },
      finishedAt: new Date(),
    }).onConflictDoNothing();
  }
  await markRunTerminal(
    run.id,
    cancelled ? 'cancelled' : warnings ? 'completed_with_warnings' : 'completed',
    {
      totalItems: plans.length,
      processedItems: processed,
      createdItems: created,
      replacedItems: replaced,
      skippedItems: skipped,
      convertedItems: converted,
      warningItems: warnings,
    },
  );
  // One full snapshot sync at the end is enough; do not enqueue per page.
  // Skip it on cancellation — a partial import shouldn't trigger a git commit.
  if (processed > 0 && !cancelled) {
    await enqueueGitExport('manual');
  }
}

export async function runTransferImport(runId: string): Promise<void> {
  const run = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
  if (!run) return;
  await db.update(schema.transferRuns).set({
    status: 'running',
    phase: 'writing_assets',
    startedAt: run.startedAt ?? new Date(),
  }).where(eq(schema.transferRuns.id, runId));
  try {
    if (run.kind === 'archive_import') await runArchiveImport(run);
    else if (run.kind === 'wikijs_import') await runWikiJsImport(run);
    else throw new Error('Unsupported import kind');
  } catch (error) {
    await markRunTerminal(runId, 'failed', {
      errorCode: 'IMPORT_FAILED',
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Import failed',
    });
  }
}
