import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import { writePortableArchive } from '@/server/transfers/archive-writer';
import { sha256 } from '@/server/transfers/manifest';
import { runTransferPreview } from './transfer-preview';

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
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await rm(tempDir, { recursive: true, force: true });
  await closeDb();
});

type PageInput = { id: string; path: string; locale?: string; markdown?: string };

/** Build a valid portable archive on disk and wire up ready artifact + queued run rows. */
async function buildArchiveAndRun(opts: {
  pages: PageInput[];
  assets?: { id: string; bytes: Buffer; contentType: 'image/png' }[];
  conflictStrategy?: 'skip' | 'replace';
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
      options: { conflictStrategy: opts.conflictStrategy ?? 'skip' },
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
