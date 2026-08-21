import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { writePortableArchive } from '@/server/transfers/archive-writer';
import { sha256 } from '@/server/transfers/manifest';
import { DomainError } from '@/server/errors';
import { runTransferPreview } from './transfer-preview';

const mocks = vi.hoisted(() => ({
  WikiJsClient: vi.fn(),
  getRuntimeSource: vi.fn(),
}));

vi.mock('@/server/transfers/wikijs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/transfers/wikijs-client')>()),
  WikiJsClient: mocks.WikiJsClient,
}));

vi.mock('@/server/services/transfer-sources', () => ({
  getRuntimeSource: mocks.getRuntimeSource,
}));

// Redirect the singleton store to a temp dir BEFORE the job module (and its
// transitive config import) is evaluated, so inspectPortableArchive reads from
// the same dir writePortableArchive writes to.
const { tempDir } = vi.hoisted(() => {
  /* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before ESM imports initialize */
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-transfer-preview-'));
  process.env.TRANSFER_ARTIFACT_BASE_PATH = dir;
  return { tempDir: dir };
});

const TRUNCATE =
  'TRUNCATE TABLE transfer_page_mappings, transfer_asset_mappings, transfer_items, transfer_runs, transfer_artifacts, transfer_sources, page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';

const NOW = '2026-06-21T00:00:00.000Z';

let adminId: string;
let spaceId: string;
let wikijsSourceId: string;

beforeAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: `preview-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  adminId = admin!.id;
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'default', name: 'Default' })
    .returning();
  spaceId = space!.id;

  const [source] = await db
    .insert(schema.transferSources)
    .values({
      name: 'Wiki.js Test',
      baseUrl: 'http://wiki.example.com',
      allowPrivateNetwork: false,
      credentialsEncrypted: 'encrypted',
      status: 'healthy',
      createdBy: adminId,
    })
    .returning();
  wikijsSourceId = source!.id;
  mocks.getRuntimeSource.mockResolvedValue({
    id: wikijsSourceId,
    baseUrl: 'http://wiki.example.com',
    apiToken: 'token',
    allowPrivateNetwork: false,
  });
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await rm(tempDir, { recursive: true, force: true });
  await closeDb();
});

type WikiJsPageDef = {
  id: number;
  path: string;
  locale?: string;
  title?: string;
  history?: Array<{ versionId: number; versionDate: string; authorId: number; authorName: string; actionType: string }>;
};

/** Wire up a queued wikijs_preview run backed by a mocked WikiJsClient. */
async function buildWikiJsPreviewRun(opts: {
  pages: WikiJsPageDef[];
  conflictStrategy?: 'skip' | 'replace';
  includeHistory?: boolean;
  historyLimit?: number;
  historyAccessError?: Error;
  requestCancellationAfterHistoryForPageId?: number;
}) {
  mocks.WikiJsClient.mockImplementation(() => ({
    listPages: vi.fn(async () =>
      opts.pages.map((p) => ({
        id: p.id,
        path: p.path,
        locale: p.locale ?? 'en',
        title: p.title ?? p.path,
        description: null,
        contentType: 'text/markdown',
        isPublished: true,
        isPrivate: false,
        createdAt: null,
        updatedAt: null,
        tags: [],
      })),
    ),
    listHistory: vi.fn(async (id: number) => {
      const page = opts.pages.find((p) => p.id === id);
      if (id === opts.requestCancellationAfterHistoryForPageId) {
        await db.update(schema.transferRuns).set({ cancelRequested: true }).where(eq(schema.transferRuns.status, 'running'));
      }
      return [...(page?.history ?? [])].sort((a, b) => a.versionId - b.versionId);
    }),
    assertHistoryAccess: vi.fn(async () => {
      if (opts.historyAccessError) throw opts.historyAccessError;
    }),
  }));

  const [run] = await db
    .insert(schema.transferRuns)
    .values({
      kind: 'wikijs_preview',
      status: 'queued',
      actorUserId: adminId,
      sourceId: wikijsSourceId,
      options: {
        conflictStrategy: opts.conflictStrategy ?? 'skip',
        includeHistory: Boolean(opts.includeHistory),
        historyLimit: opts.historyLimit ?? 300,
      },
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  return { run: run! };
}

type HistoryVersionInput = {
  revisionId: string;
  versionNumber: number;
  markdown: string;
  title: string;
  contentHash: string;
  publishedAt: string;
  createdAt: string;
  authorEmail: string | null;
  authorDisplayName: string | null;
  contentType: string | null;
  originalAssetId: string | null;
};

type PageInput = {
  id: string;
  path: string;
  locale?: string;
  markdown?: string;
  historyVersions?: HistoryVersionInput[];
};

/** Build a valid portable archive on disk and wire up ready artifact + queued run rows. */
async function buildArchiveAndRun(opts: {
  pages: PageInput[];
  assets?: { id: string; bytes: Buffer; contentType: 'image/png' }[];
  conflictStrategy?: 'skip' | 'replace';
  includeHistory?: boolean;
  historyLimit?: number;
}) {
  const storageKey = `${randomUUID()}.zip`;
  const pages = opts.pages.map((p) => {
    const markdown = p.markdown ?? `# ${p.path}`;
    return {
      id: p.id,
      revisionId: `r-${p.id}`,
      path: p.path,
      locale: p.locale ?? 'en',
      title: p.path,
      markdown,
      contentHash: sha256(markdown),
      publishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      assetIds: [] as string[],
      spaceKind: 'wiki' as const,
      spaceSlug: 'default',
      markdownContentType: 'text/markdown',
      historyVersions: p.historyVersions,
    };
  });
  const assets = (opts.assets ?? []).map((a) => ({
    id: a.id,
    bytes: a.bytes,
    contentType: a.contentType,
    contentHash: sha256(a.bytes),
    sizeBytes: a.bytes.length,
  }));
  const { stored } = await writePortableArchive({
    storageKey,
    instanceId: 'test-instance',
    productVersion: '1.0.0',
    capturedAt: NOW,
    pages,
    assets,
  });
  const [artifact] = await db
    .insert(schema.transferArtifacts)
    .values({
      kind: 'source_archive',
      status: 'ready',
      createdBy: adminId,
      originalFilename: 'portable.zip',
      storageKey: stored.storageKey,
      contentType: 'application/zip',
      sizeBytes: stored.sizeBytes,
      contentHash: stored.contentHash,
      readyAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  const [run] = await db
    .insert(schema.transferRuns)
    .values({
      kind: 'archive_preview',
      status: 'queued',
      actorUserId: adminId,
      sourceArtifactId: artifact!.id,
      options: {
        conflictStrategy: opts.conflictStrategy ?? 'skip',
        includeHistory: Boolean(opts.includeHistory),
        historyLimit: opts.historyLimit ?? 300,
      },
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  return { artifact: artifact!, run: run!, stored };
}

describe('runTransferPreview (archive_preview)', () => {
  it('classifies every page and asset with matching counts', async () => {
    const { run, stored } = await buildArchiveAndRun({
      pages: [{ id: '1', path: 'docs/a' }, { id: '2', path: 'docs/b' }],
      assets: [{ id: 'asset-1', bytes: Buffer.from([1, 2, 3, 4]), contentType: 'image/png' }],
    });
    await runTransferPreview(run!.id);

    const updated = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(updated?.status).toBe('completed');
    expect(updated?.sourceFingerprint).toBe(stored.contentHash);
    expect(updated?.totalItems).toBe(3);
    expect(updated?.createdItems).toBe(2);
    expect(updated?.skippedItems).toBe(0);

    const items = await db.query.transferItems.findMany({
      where: eq(schema.transferItems.runId, run.id),
    });
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.kind === 'page')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'asset')).toHaveLength(1);
    expect(items.every((i) => i.status === 'completed')).toBe(true);
    const assetItem = items.find((i) => i.kind === 'asset');
    expect(assetItem?.action).toBe('create');
    expect(assetItem?.bytesTotal).toBe(4);
  });

  it('skips a pre-existing page by default (default conflict strategy)', async () => {
    await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'conflict',
        path: 'docs/conflict',
        locale: 'en',
        title: 'Conflict',
        authorId: adminId,
      })
      .returning();
    const { run } = await buildArchiveAndRun({
      pages: [{ id: '10', path: 'docs/conflict' }, { id: '11', path: 'docs/new' }],
    });
    await runTransferPreview(run!.id);

    const updated = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(updated?.createdItems).toBe(1);
    expect(updated?.skippedItems).toBe(1);

    const items = await db.query.transferItems.findMany({
      where: eq(schema.transferItems.runId, run.id),
    });
    const conflict = items.find((i) => i.displayName === 'en/docs/conflict');
    expect(conflict?.action).toBe('skip');
    const fresh = items.find((i) => i.displayName === 'en/docs/new');
    expect(fresh?.action).toBe('create');
  });

  it('replaces a pre-existing page when conflict strategy is replace', async () => {
    await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'replace',
        path: 'docs/replace',
        locale: 'en',
        title: 'Replace',
        authorId: adminId,
      })
      .returning();
    const { run } = await buildArchiveAndRun({
      pages: [{ id: '20', path: 'docs/replace' }],
      conflictStrategy: 'replace',
    });
    await runTransferPreview(run!.id);

    const updated = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(updated?.replacedItems).toBe(1);
    expect(updated?.createdItems).toBe(0);

    const items = await db.query.transferItems.findMany({
      where: eq(schema.transferItems.runId, run.id),
    });
    expect(items.find((i) => i.kind === 'page')?.action).toBe('replace');
  });

  it('predicts a new page\'s resulting address, adjusting it when the source path collides with an existing address (035 T069)', async () => {
    await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'docs/preview-address-taken',
        path: 'docs/preview-address-taken-holder',
        locale: 'en',
        title: 'Existing Holder',
        authorId: adminId,
      })
      .returning();
    const { run } = await buildArchiveAndRun({
      pages: [{ id: '50', path: 'docs/preview-address-taken' }],
    });
    await runTransferPreview(run!.id);

    const items = await db.query.transferItems.findMany({
      where: eq(schema.transferItems.runId, run.id),
    });
    const item = items.find((i) => i.kind === 'page');
    expect(item?.action).toBe('create');
    const metadata = item?.metadata as { address?: string; addressAdjustmentReason?: string };
    expect(metadata.address).not.toBe('docs/preview-address-taken');
    expect(metadata.address).toMatch(/^docs\/preview-address-taken-\d+$/);
    expect(metadata.addressAdjustmentReason).toBe('taken');
  });

  it('predicts an unchanged page\'s own current address for a skip/replace item, not its source path (035 T069)', async () => {
    await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'docs/preview-address-unchanged',
        path: 'docs/preview-address-existing',
        locale: 'en',
        title: 'Existing',
        authorId: adminId,
      })
      .returning();
    const { run } = await buildArchiveAndRun({
      pages: [{ id: '51', path: 'docs/preview-address-existing' }],
      conflictStrategy: 'replace',
    });
    await runTransferPreview(run!.id);

    const items = await db.query.transferItems.findMany({
      where: eq(schema.transferItems.runId, run.id),
    });
    const item = items.find((i) => i.kind === 'page');
    expect(item?.action).toBe('replace');
    const metadata = item?.metadata as { address?: string; addressAdjustmentReason?: string };
    expect(metadata.address).toBe('docs/preview-address-unchanged');
    expect(metadata.addressAdjustmentReason).toBeUndefined();
  });

  it('fails the run when the archive on disk is corrupt', async () => {
    const { artifact } = await buildArchiveAndRun({
      pages: [{ id: '30', path: 'docs/corrupt' }],
    });
    await writeFile(
      transferArtifactStore.pathFor(artifact.storageKey),
      Buffer.from('not a zip'),
    );
    const [run] = await db
      .insert(schema.transferRuns)
      .values({
        kind: 'archive_preview',
        status: 'queued',
        actorUserId: adminId,
        sourceArtifactId: artifact.id,
        options: { conflictStrategy: 'skip' },
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    await runTransferPreview(run!.id);

    const failed = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('INVALID_ARCHIVE');
  });

  it('fails the run when the source artifact is not ready', async () => {
    const [artifact] = await db
      .insert(schema.transferArtifacts)
      .values({
        kind: 'source_archive',
        status: 'uploading',
        createdBy: adminId,
        storageKey: `${randomUUID()}.zip`,
        contentType: 'application/zip',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    const [run] = await db
      .insert(schema.transferRuns)
      .values({
        kind: 'archive_preview',
        status: 'queued',
        actorUserId: adminId,
        sourceArtifactId: artifact!.id,
        options: { conflictStrategy: 'skip' },
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    await runTransferPreview(run!.id);

    const failed = await db.query.transferRuns.findFirst({
      where: eq(schema.transferRuns.id, run!.id),
    });
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('INVALID_ARCHIVE');
  });
});

describe('previewArchive includeHistory', () => {
  const historyVersion = (overrides: Partial<HistoryVersionInput> = {}): HistoryVersionInput => ({
    revisionId: 'r-old',
    versionNumber: 1,
    markdown: '# old',
    title: 'Old title',
    contentHash: sha256('old'),
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    authorEmail: null,
    authorDisplayName: null,
    contentType: null,
    originalAssetId: null,
    ...overrides,
  });

  it('reports history metadata for a create action', async () => {
    const { run } = await buildArchiveAndRun({
      pages: [{ id: 'h1', path: 'docs/history-new', historyVersions: [historyVersion()] }],
      includeHistory: true,
      historyLimit: 300,
    });
    await runTransferPreview(run!.id);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    const item = items.find((i) => i.kind === 'page')!;
    expect(item.action).toBe('create');
    expect((item.metadata as { history?: { totalAvailable: number; includedCount: number } }).history).toEqual({
      totalAvailable: 2,
      includedCount: 2,
      limit: 300,
    });
  });

  it('downgrades an unmapped existing page\'s replace to skip with HISTORY_REPLACE_UNMAPPED_PAGE', async () => {
    await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'unmapped-history',
        path: 'docs/unmapped-history',
        locale: 'en',
        title: 'Pre-existing, not from this archive',
        authorId: adminId,
      })
      .returning();
    const { run } = await buildArchiveAndRun({
      pages: [{ id: 'h2', path: 'docs/unmapped-history', historyVersions: [historyVersion({ revisionId: 'r-old-2' })] }],
      conflictStrategy: 'replace',
      includeHistory: true,
    });
    await runTransferPreview(run!.id);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run!.id) });
    expect(updated?.status).toBe('completed_with_warnings');
    expect(updated?.skippedItems).toBe(1);
    expect(updated?.replacedItems).toBe(0);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    const item = items.find((i) => i.kind === 'page')!;
    expect(item.action).toBe('skip');
    expect(item.warningCode).toBe('HISTORY_REPLACE_UNMAPPED_PAGE');
  });

  it('allows replace when the target page was previously imported from this same archive', async () => {
    const [page] = await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'mapped-history',
        path: 'docs/mapped-history',
        locale: 'en',
        title: 'Previously imported from this archive',
        authorId: adminId,
      })
      .returning();
    const { run, stored } = await buildArchiveAndRun({
      pages: [{ id: 'h3', path: 'docs/mapped-history', historyVersions: [historyVersion({ revisionId: 'r-old-3' })] }],
      conflictStrategy: 'replace',
      includeHistory: true,
    });
    await db.insert(schema.transferPageMappings).values({
      sourceType: 'archive',
      sourceIdentity: stored.contentHash,
      sourcePageKey: 'h3',
      sourceFingerprint: sha256('# docs/mapped-history'),
      targetPageId: page!.id,
      targetPath: 'docs/mapped-history',
      targetLocale: 'en',
      lastRunId: run!.id,
    });
    await runTransferPreview(run!.id);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run!.id) });
    expect(updated?.replacedItems).toBe(1);
    expect(updated?.skippedItems).toBe(0);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    const item = items.find((i) => i.kind === 'page')!;
    expect(item.action).toBe('replace');
    expect(item.warningCode).toBeNull();
  });
});

describe('runTransferPreview (wikijs_preview) address prediction (035 T069)', () => {
  it('adjusts a new page\'s predicted address when the source path collides with an existing address', async () => {
    await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'docs/wikijs-preview-taken',
        path: 'docs/wikijs-preview-taken-holder',
        locale: 'en',
        title: 'Existing Holder',
        authorId: adminId,
      })
      .returning();
    const { run } = await buildWikiJsPreviewRun({
      pages: [{ id: 200, path: 'docs/wikijs-preview-taken' }],
    });

    await runTransferPreview(run.id);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    const item = items.find((i) => i.kind === 'page');
    expect(item?.action).toBe('create');
    const metadata = item?.metadata as { address?: string; addressAdjustmentReason?: string };
    expect(metadata.address).not.toBe('docs/wikijs-preview-taken');
    expect(metadata.address).toMatch(/^docs\/wikijs-preview-taken-\d+$/);
    expect(metadata.addressAdjustmentReason).toBe('taken');
  });
});

describe('previewWikiJs includeHistory', () => {
  it('cancels a one-page history preview requested during its final item', async () => {
    const { run } = await buildWikiJsPreviewRun({
      pages: [{
        id: 99,
        path: 'docs/cancel-history-preview',
        history: [{ versionId: 1, versionDate: '2026-01-01T00:00:00.000Z', authorId: 1, authorName: 'A', actionType: 'initial' }],
      }],
      includeHistory: true,
      requestCancellationAfterHistoryForPageId: 99,
    });

    await runTransferPreview(run.id);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.id) });
    expect(updated).toMatchObject({ status: 'cancelled', processedItems: 1, totalItems: 1 });
  });

  it('does not restart a completed preview when its job is delivered again', async () => {
    const { run } = await buildWikiJsPreviewRun({ pages: [{ id: 98, path: 'docs/no-restart' }] });

    await runTransferPreview(run.id);
    const completed = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.id) });
    await runTransferPreview(run.id);
    const afterRedelivery = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.id) });

    expect(afterRedelivery).toMatchObject({
      status: 'completed',
      processedItems: completed?.processedItems,
      finishedAt: completed?.finishedAt,
    });
  });

  it('fails the whole run up front when the source lacks read:history access', async () => {
    const { run } = await buildWikiJsPreviewRun({
      pages: [{ id: 100, path: 'docs/one' }, { id: 101, path: 'docs/two' }],
      includeHistory: true,
      historyAccessError: new DomainError('WIKIJS_HISTORY_FORBIDDEN', 'missing read:history'),
    });

    await runTransferPreview(run.id);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.id) });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorCode).toBe('WIKIJS_HISTORY_FORBIDDEN');

    // Aborted before any per-page processing — no partial item rows.
    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    expect(items).toHaveLength(0);
  });

  it('marks a page item WIKIJS_HISTORY_TRUNCATED when its trail exceeds the configured limit', async () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      versionId: i + 1,
      versionDate: `2026-01-0${i + 1}T00:00:00.000Z`,
      authorId: 1,
      authorName: 'A',
      actionType: 'edit',
    }));
    const { run } = await buildWikiJsPreviewRun({
      pages: [{ id: 102, path: 'docs/truncate', history }],
      includeHistory: true,
      historyLimit: 3,
    });

    await runTransferPreview(run.id);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, run.id) });
    expect(updated?.status).toBe('completed_with_warnings');

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    expect(items).toHaveLength(1);
    expect(items[0]?.action).toBe('create');
    expect(items[0]?.warningCode).toBe('WIKIJS_HISTORY_TRUNCATED');
    const historyMeta = (items[0]?.metadata as { history?: { truncated: boolean; includedCount: number } }).history;
    expect(historyMeta?.truncated).toBe(true);
    expect(historyMeta?.includedCount).toBe(3);
  });

  it('downgrades a full-history replace to skip when the existing page has no mapping from this source', async () => {
    await db.insert(schema.pages).values({
      spaceId, slug: 'unmapped', path: 'docs/unmapped', locale: 'en', title: 'Manually created', authorId: adminId,
    });
    const { run } = await buildWikiJsPreviewRun({
      pages: [{ id: 103, path: 'docs/unmapped' }],
      includeHistory: true,
      conflictStrategy: 'replace',
    });

    await runTransferPreview(run.id);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    expect(items).toHaveLength(1);
    expect(items[0]?.action).toBe('skip');
    expect(items[0]?.warningCode).toBe('HISTORY_REPLACE_UNMAPPED_PAGE');
    expect((items[0]?.metadata as { targetAction?: string }).targetAction).toBe('skip');
  });

  it('allows a full-history replace when the existing page was previously imported from this source', async () => {
    const [page] = await db.insert(schema.pages).values({
      spaceId, slug: 'mapped', path: 'docs/mapped', locale: 'en', title: 'Previously imported', authorId: adminId,
    }).returning();
    const [priorRun] = await db.insert(schema.transferRuns).values({
      kind: 'wikijs_import',
      status: 'completed',
      actorUserId: adminId,
      sourceId: wikijsSourceId,
      options: {},
      expiresAt: new Date(Date.now() + 3_600_000),
    }).returning();
    await db.insert(schema.transferPageMappings).values({
      sourceType: 'wikijs',
      sourceIdentity: wikijsSourceId,
      sourcePageKey: '104',
      sourceFingerprint: 'irrelevant',
      targetPageId: page!.id,
      targetPath: 'docs/mapped',
      targetLocale: 'en',
      lastRunId: priorRun!.id,
    });
    const { run } = await buildWikiJsPreviewRun({
      pages: [{ id: 104, path: 'docs/mapped' }],
      includeHistory: true,
      conflictStrategy: 'replace',
    });

    await runTransferPreview(run.id);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, run.id) });
    expect(items).toHaveLength(1);
    expect(items[0]?.action).toBe('replace');
    expect(items[0]?.warningCode).toBeNull();
  });
});
