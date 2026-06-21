import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { capturePublishedSnapshot } from '@/server/services/transfer-export';
import { sha256, ONE_PIXEL_PNG } from '../../../test/transfer-fixtures';
import { runTransferExport } from './transfer-export';

// The job streams the captured snapshot into a portable ZIP via the artifact
// store (real filesystem). These tests focus on the DB-backed selection and
// run-finalization logic, so the archive writer is stubbed to avoid touching
// the configured TRANSFER_ARTIFACT_BASE_PATH.
const archiveWriter = vi.hoisted(() => ({
  writePortableArchive: vi.fn(),
}));
vi.mock('@/server/transfers/archive-writer', () => archiveWriter);

const ASSET_BYTES = ONE_PIXEL_PNG;
const ASSET_HASH = sha256(ASSET_BYTES);

async function truncate(): Promise<void> {
  await db.execute(
    sql.raw(
      'TRUNCATE TABLE transfer_asset_mappings, transfer_page_mappings, transfer_items, transfer_artifacts, transfer_runs, transfer_sources, content_asset_refs, content_blobs, content_assets, page_revisions, pages, sessions, users, spaces RESTART IDENTITY CASCADE',
    ),
  );
}

const seed = {
  user: randomUUID(),
  space: randomUUID(),
  assetShared: randomUUID(),
  assetMissing: randomUUID(),
  pubA: randomUUID(),
  revA: randomUUID(),
  pubC: randomUUID(),
  revC: randomUUID(),
  pubD: randomUUID(),
  revD: randomUUID(),
  draftB: randomUUID(),
  revB: randomUUID(),
  deletedE: randomUUID(),
  revE: randomUUID(),
};

beforeAll(async () => {
  await truncate();
  await db.insert(schema.users).values({
    id: seed.user,
    email: `export-${seed.user}@example.com`,
    passwordHash: 'X',
    role: 'admin',
  });
  // capturePublishedSnapshot resolves the export scope via slug='default'.
  await db.insert(schema.spaces).values({
    id: seed.space,
    slug: 'default',
    name: 'Default',
    anonymousRead: true,
  });

  // A shared local image referenced by multiple published pages.
  await db.insert(schema.contentAssets).values({
    id: seed.assetShared,
    contentHash: ASSET_HASH,
    contentType: 'image/png',
    sizeBytes: ASSET_BYTES.length,
    createdBy: seed.user,
  });
  await db.insert(schema.contentBlobs).values({
    assetId: seed.assetShared,
    bytes: ASSET_BYTES,
  });

  // Published page A — references the shared asset only.
  const mdA = `# A\n\n![a](/api/assets/${seed.assetShared})`;
  await db.insert(schema.pages).values({
    id: seed.pubA,
    spaceId: seed.space,
    slug: 'a',
    path: 'a',
    title: 'A',
    authorId: seed.user,
    currentPublishedVersionId: seed.revA,
    latestVersionId: seed.revA,
  });
  await db.insert(schema.pageRevisions).values({
    id: seed.revA,
    pageId: seed.pubA,
    versionNumber: 1,
    contentSource: mdA,
    contentHtml: '<h1>A</h1>',
    contentHash: sha256(mdA),
    authorId: seed.user,
    status: 'published',
    publishedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  // Published page C — references the shared asset AND an external image URL.
  const mdC = `# C\n\n![shared](/api/assets/${seed.assetShared}) ![ext](https://example.com/ext.png)`;
  await db.insert(schema.pages).values({
    id: seed.pubC,
    spaceId: seed.space,
    slug: 'c',
    path: 'c',
    title: 'C',
    authorId: seed.user,
    currentPublishedVersionId: seed.revC,
    latestVersionId: seed.revC,
  });
  await db.insert(schema.pageRevisions).values({
    id: seed.revC,
    pageId: seed.pubC,
    versionNumber: 1,
    contentSource: mdC,
    contentHtml: '<h1>C</h1>',
    contentHash: sha256(mdC),
    authorId: seed.user,
    status: 'published',
    publishedAt: new Date('2026-01-03T00:00:00.000Z'),
  });

  // Published page D — references a local asset UUID that has NO content_assets
  // row (unavailable asset). The page must still export; the asset is dropped.
  const mdD = `# D\n\n![missing](/api/assets/${seed.assetMissing})`;
  await db.insert(schema.pages).values({
    id: seed.pubD,
    spaceId: seed.space,
    slug: 'd',
    path: 'd',
    title: 'D',
    authorId: seed.user,
    currentPublishedVersionId: seed.revD,
    latestVersionId: seed.revD,
  });
  await db.insert(schema.pageRevisions).values({
    id: seed.revD,
    pageId: seed.pubD,
    versionNumber: 1,
    contentSource: mdD,
    contentHtml: '<h1>D</h1>',
    contentHash: sha256(mdD),
    authorId: seed.user,
    status: 'published',
    publishedAt: new Date('2026-01-04T00:00:00.000Z'),
  });

  // Draft page B — no currentPublishedVersionId, must be excluded entirely.
  const mdB = `# B\n\n![a](/api/assets/${seed.assetShared})`;
  await db.insert(schema.pages).values({
    id: seed.draftB,
    spaceId: seed.space,
    slug: 'b',
    path: 'b',
    title: 'B',
    authorId: seed.user,
    currentPublishedVersionId: null,
    latestVersionId: seed.revB,
  });
  await db.insert(schema.pageRevisions).values({
    id: seed.revB,
    pageId: seed.draftB,
    versionNumber: 1,
    contentSource: mdB,
    contentHtml: '<h1>B</h1>',
    contentHash: sha256(mdB),
    authorId: seed.user,
    status: 'draft',
  });

  // Soft-deleted published page E — excluded by the deletedAt IS NULL filter.
  const mdE = `# E\n\n![a](/api/assets/${seed.assetShared})`;
  await db.insert(schema.pages).values({
    id: seed.deletedE,
    spaceId: seed.space,
    slug: 'e',
    path: 'e',
    title: 'E',
    authorId: seed.user,
    currentPublishedVersionId: seed.revE,
    latestVersionId: seed.revE,
    deletedAt: new Date('2026-01-05T00:00:00.000Z'),
  });
  await db.insert(schema.pageRevisions).values({
    id: seed.revE,
    pageId: seed.deletedE,
    versionNumber: 1,
    contentSource: mdE,
    contentHtml: '<h1>E</h1>',
    contentHash: sha256(mdE),
    authorId: seed.user,
    status: 'published',
    publishedAt: new Date('2026-01-05T00:00:00.000Z'),
  });

  archiveWriter.writePortableArchive.mockResolvedValue({
    stored: { storageKey: 'mock.zip', sizeBytes: 42, contentHash: 'f'.repeat(64) },
    manifest: { pages: [], assets: [], files: [] },
  });
});

afterAll(async () => {
  await truncate();
  await closeDb();
});

describe('capturePublishedSnapshot', () => {
  it('selects only published, non-deleted pages', async () => {
    const snapshot = await capturePublishedSnapshot();
    // Draft B (no currentPublishedVersionId) and soft-deleted E are excluded;
    // pages are ordered by (locale, path).
    expect(snapshot.pages.map((page) => page.path)).toEqual(['a', 'c', 'd']);
  });

  it('uses the published revision (currentPublishedVersionId) for each page', async () => {
    const snapshot = await capturePublishedSnapshot();
    const revisionByPath = Object.fromEntries(
      snapshot.pages.map((page) => [page.path, page.revisionId]),
    );
    expect(revisionByPath).toEqual({
      a: seed.revA,
      c: seed.revC,
      d: seed.revD,
    });
  });

  it('emits a shared local asset exactly once with its bytes', async () => {
    const snapshot = await capturePublishedSnapshot();
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0]!.id).toBe(seed.assetShared);
    expect(snapshot.assets[0]!.contentHash).toBe(ASSET_HASH);
    expect(snapshot.assets[0]!.bytes.equals(ASSET_BYTES)).toBe(true);
  });

  // NOTE (spec deviation): the current implementation does NOT record an
  // external-image warning. extractLocalAssetIds only matches
  // /api/assets/<uuid>, so external URLs are silently ignored; no transfer_items
  // warning row is produced by capturePublishedSnapshot (nor by the job).
  it('ignores external image URLs (no asset materialized, no warning surfaced)', async () => {
    const snapshot = await capturePublishedSnapshot();
    const pageC = snapshot.pages.find((page) => page.path === 'c')!;
    expect(pageC.assetIds).toEqual([seed.assetShared]);
    expect(snapshot.assets.some((asset) => asset.id !== seed.assetShared)).toBe(false);
  });

  // NOTE (spec deviation): the current implementation does NOT emit a warning
  // outcome for an unavailable asset. The content_assets lookup returns nothing
  // and the entry is `continue`d; the referencing page is still exported.
  it('drops references to unavailable assets silently (page still exported)', async () => {
    const snapshot = await capturePublishedSnapshot();
    const pageD = snapshot.pages.find((page) => page.path === 'd')!;
    expect(pageD).toBeDefined();
    expect(pageD.assetIds).toEqual([seed.assetMissing]);
    expect(snapshot.assets.some((asset) => asset.id === seed.assetMissing)).toBe(false);
  });
});

describe('runTransferExport', () => {
  it('finalizes a site_export run as completed with counts and a ready artifact', async () => {
    archiveWriter.writePortableArchive.mockClear();
    const [run] = await db
      .insert(schema.transferRuns)
      .values({
        kind: 'site_export',
        actorUserId: seed.user,
        expiresAt: new Date(Date.now() + 72 * 3_600_000),
      })
      .returning();

    await runTransferExport(run!.id);

    const updated = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(updated!.status).toBe('completed');
    expect(updated!.phase).toBe('completed');
    // 3 published pages + 1 unique shared asset.
    expect(updated!.totalItems).toBe(4);
    expect(updated!.processedItems).toBe(4);
    expect(updated!.createdItems).toBe(4);
    expect(updated!.reportArtifactId).not.toBeNull();

    const artifact = await db.query.transferArtifacts.findFirst({
      where: eq(schema.transferArtifacts.runId, run!.id),
    });
    expect(artifact!.kind).toBe('export_archive');
    expect(artifact!.status).toBe('ready');
    expect(artifact!.sizeBytes).toBe(42);
    expect(archiveWriter.writePortableArchive).toHaveBeenCalledTimes(1);
  });

  it('marks a site_export run as cancelled when cancelRequested is set', async () => {
    const [run] = await db
      .insert(schema.transferRuns)
      .values({
        kind: 'site_export',
        actorUserId: seed.user,
        cancelRequested: true,
        expiresAt: new Date(Date.now() + 72 * 3_600_000),
      })
      .returning();

    await runTransferExport(run!.id);

    const updated = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(updated!.status).toBe('cancelled');
    const artifact = await db.query.transferArtifacts.findFirst({
      where: eq(schema.transferArtifacts.runId, run!.id),
    });
    expect(artifact).toBeUndefined();
  });

  it('ignores runs whose kind is not site_export', async () => {
    const [run] = await db
      .insert(schema.transferRuns)
      .values({
        kind: 'archive_preview',
        actorUserId: seed.user,
        expiresAt: new Date(Date.now() + 72 * 3_600_000),
      })
      .returning();

    await runTransferExport(run!.id);

    const updated = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    // Early return: the queued row is left untouched and no artifact is created.
    expect(updated!.status).toBe('queued');
    const artifact = await db.query.transferArtifacts.findFirst({
      where: eq(schema.transferArtifacts.runId, run!.id),
    });
    expect(artifact).toBeUndefined();
  });
});
