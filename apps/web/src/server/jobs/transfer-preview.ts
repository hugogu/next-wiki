import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { inspectPortableArchive } from '@/server/transfers/archive-reader';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { parsePage } from '@/server/transfers/manifest';
import { markRunTerminal } from '@/server/services/transfers';
import { getRuntimeSource } from '@/server/services/transfer-sources';
import { WikiJsClient } from '@/server/transfers/wikijs-client';
import { getTransferConverter } from '@/server/transfers/registry';
import { findMarkdownImages } from '@/server/transfers/markdown-links';

async function previewArchive(run: typeof schema.transferRuns.$inferSelect) {
  const artifact = run.sourceArtifactId
    ? await db.query.transferArtifacts.findFirst({
        where: eq(schema.transferArtifacts.id, run.sourceArtifactId),
      })
    : null;
  if (!artifact || artifact.status !== 'ready') throw new Error('Source archive is unavailable');
  const inspected = await inspectPortableArchive(transferArtifactStore.pathFor(artifact.storageKey));
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
  if (!space) throw new Error('Default space not found');
  const strategy = (run.options as { conflictStrategy?: string }).conflictStrategy ?? 'skip';
  let created = 0;
  let replaced = 0;
  let skipped = 0;
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
  await markRunTerminal(run.id, 'completed', {
    sourceFingerprint: artifact.contentHash,
    totalItems: items.length,
    processedItems: items.length,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
  });
}

async function previewWikiJs(run: typeof schema.transferRuns.$inferSelect) {
  if (!run.sourceId) throw new Error('Wiki.js source is missing');
  const source = await getRuntimeSource(run.sourceId);
  const client = new WikiJsClient(source.baseUrl, source.apiToken, source.allowPrivateNetwork);
  const inventory = await client.listPages();
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
  if (!space) throw new Error('Default space not found');
  const strategy = (run.options as { conflictStrategy?: string }).conflictStrategy ?? 'skip';
  const items: (typeof schema.transferItems.$inferInsert)[] = [];
  const fingerprints: string[] = [];
  let created = 0;
  let replaced = 0;
  let skipped = 0;
  let converted = 0;
  for (const summary of inventory) {
    const page = await client.getPage(summary.id);
    const converter = getTransferConverter(page.contentType, page.editor);
    if (!converter) {
      skipped += 1;
      items.push({
        runId: run.id,
        kind: 'page',
        sourceKey: String(page.id),
        sourceFingerprint: page.fingerprint,
        displayName: `${page.locale}/${page.path}`,
        targetKey: `${page.locale}/${page.path}`,
        action: 'skip',
        status: 'warning',
        warningCode: 'UNSUPPORTED_SOURCE_CONTENT',
        warningMessage: `Unsupported Wiki.js content type: ${page.contentType ?? page.editor ?? 'unknown'}`,
        metadata: { contentType: page.contentType, editor: page.editor },
        finishedAt: new Date(),
      });
      continue;
    }
    const conversion = converter(page.content);
    const existing = await db.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, page.path),
        eq(schema.pages.locale, page.locale),
      ),
    });
    const action = conversion.converted
      ? 'convert'
      : existing
        ? strategy === 'replace' ? 'replace' : 'skip'
        : 'create';
    if (action === 'create') created += 1;
    else if (action === 'replace') replaced += 1;
    else if (action === 'convert') converted += 1;
    else skipped += 1;
    items.push({
      runId: run.id,
      kind: 'page',
      sourceKey: String(page.id),
      sourceFingerprint: page.fingerprint,
      displayName: `${page.locale}/${page.path}`,
      targetKey: `${page.locale}/${page.path}`,
      action,
      status: 'completed',
      metadata: {
        title: page.title,
        contentType: page.contentType,
        editor: page.editor,
        converted: conversion.converted,
        targetAction: existing ? strategy : 'create',
      },
      finishedAt: new Date(),
    });
    for (const image of findMarkdownImages(conversion.markdown)) {
      items.push({
        runId: run.id,
        kind: 'asset',
        sourceKey: `${page.id}:${image.url}`,
        displayName: image.url,
        action: 'validate',
        status: 'completed',
        metadata: { pageId: page.id, url: image.url },
        finishedAt: new Date(),
      });
    }
    fingerprints.push(page.fingerprint);
  }
  if (items.length) await db.insert(schema.transferItems).values(items).onConflictDoNothing();
  const fingerprint = (await import('node:crypto')).createHash('sha256').update(fingerprints.sort().join('\n')).digest('hex');
  await markRunTerminal(run.id, skipped > 0 ? 'completed_with_warnings' : 'completed', {
    sourceFingerprint: fingerprint,
    totalItems: items.length,
    processedItems: items.length,
    createdItems: created,
    replacedItems: replaced,
    skippedItems: skipped,
    convertedItems: converted,
    warningItems: items.filter((item) => item.status === 'warning').length,
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
    await markRunTerminal(runId, 'failed', {
      errorCode: 'INVALID_ARCHIVE',
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Preview failed',
    });
  }
}
