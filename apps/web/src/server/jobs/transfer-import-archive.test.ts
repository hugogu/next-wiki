import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { writePortableArchive } from '@/server/transfers/archive-writer';
import { sha256 } from '@/server/transfers/manifest';
import { runTransferImport } from './transfer-import';
import { runTransferPreview } from './transfer-preview';

const { tempDir } = vi.hoisted(() => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-transfer-import-archive-'));
  process.env.TRANSFER_ARTIFACT_BASE_PATH = dir;
  return { tempDir: dir };
});

const TRUNCATE =
  'TRUNCATE TABLE transfer_page_mappings, transfer_asset_mappings, transfer_items, transfer_runs, transfer_artifacts, writing_mode_settings, raw_categories, page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';

const NOW = '2026-06-21T00:00:00.000Z';

let adminId: string;

type PageInput = {
  id: string;
  path: string;
  locale?: string;
  title?: string;
  markdown?: string;
  spaceKind: 'wiki' | 'raw' | 'generated';
  spaceSlug?: string;
  markdownContentType?: string;
  inputKind?: 'chat-transcript' | 'external-fetch' | 'script-run' | 'manual-note' | null;
  rawSource?: Record<string, unknown> | null;
};

beforeAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: `import-archive-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  adminId = admin!.id;

  await db.insert(schema.spaces).values([
    { slug: 'default', name: 'Default', kind: 'wiki' },
    { slug: 'raw', name: 'Raw', kind: 'raw' },
    { slug: 'generated', name: 'Generated', kind: 'generated' },
  ]);

  await db.insert(schema.rawCategories).values({
    name: 'Reference',
    slug: 'reference',
    description: 'Default reference category',
    isDefault: true,
  });

  await db
    .insert(schema.writingModeSettings)
    .values({ id: 'default', mode: 'llm-wiki' })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await rm(tempDir, { recursive: true, force: true });
  await closeDb();
});

async function buildArchiveAndImport(opts: { pages: PageInput[]; conflictStrategy?: 'skip' | 'replace' }) {
  const storageKey = `${randomUUID()}.zip`;
  const pages = opts.pages.map((p) => {
    const markdown = p.markdown ?? `# ${p.path}`;
    const spaceSlug = p.spaceSlug ?? (p.spaceKind === 'wiki' ? 'default' : p.spaceKind);
    const markdownContentType = p.markdownContentType ?? 'text/markdown';
    return {
      id: p.id,
      revisionId: `r-${p.id}`,
      path: p.path,
      locale: p.locale ?? 'en',
      title: p.title ?? p.path,
      markdown,
      contentHash: sha256(markdown),
      publishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      assetIds: [] as string[],
      spaceKind: p.spaceKind,
      spaceSlug,
      markdownContentType,
      inputKind: p.inputKind ?? null,
      rawSource: p.rawSource ?? null,
    };
  });

  const { stored } = await writePortableArchive({
    storageKey,
    instanceId: 'test-instance',
    productVersion: '1.0.0',
    capturedAt: NOW,
    pages,
    assets: [],
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

  const [previewRun] = await db
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

  await runTransferPreview(previewRun!.id);

  const [importRun] = await db
    .insert(schema.transferRuns)
    .values({
      kind: 'archive_import',
      status: 'queued',
      actorUserId: adminId,
      sourceArtifactId: artifact!.id,
      previewRunId: previewRun!.id,
      options: { conflictStrategy: opts.conflictStrategy ?? 'skip' },
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();

  await runTransferImport(importRun!.id);

  return { importRun, previewRun, artifact, stored };
}

describe('runTransferImport (archive_import)', () => {
  it('imports a wiki page into the default wiki space', async () => {
    await buildArchiveAndImport({
      pages: [{ id: 'w1', path: 'docs/wiki-page', title: 'Wiki Page', markdown: '# Wiki Page\n\nBody', spaceKind: 'wiki' }],
    });

    const page = await db.query.pages.findFirst({
      where: eq(schema.pages.path, 'docs/wiki-page'),
    });
    expect(page).toBeTruthy();
    expect(page!.title).toBe('Wiki Page');
  });

  it('imports a raw entry into the raw space with category and metadata', async () => {
    await buildArchiveAndImport({
      pages: [
        {
          id: 'r1',
          path: 'raw/chat-1',
          title: 'Chat Transcript',
          markdown: 'User: hello\nAssistant: hi',
          spaceKind: 'raw',
          markdownContentType: 'text/plain',
          inputKind: 'chat-transcript',
          rawSource: { sourceUrl: 'https://example.com/chat/1' },
        },
      ],
    });

    const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'raw') });
    const page = await db.query.pages.findFirst({
      where: eq(schema.pages.spaceId, space!.id),
    });
    expect(page).toBeTruthy();
    expect(page!.title).toBe('Chat Transcript');
    expect(page!.rawCategoryId).toBeTruthy();
    expect(page!.nature).toBe('original');

    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.pageId, page!.id),
    });
    expect(revision).toBeTruthy();
    expect(revision!.contentType).toBe('text/plain');
    expect(revision!.contentSource).toBe('User: hello\nAssistant: hi');
    expect(revision!.sourceMetadata).toMatchObject({
      inputKind: 'chat-transcript',
      sourceUrl: 'https://example.com/chat/1',
    });
  });

  it('imports a generated page into the generated space', async () => {
    await buildArchiveAndImport({
      pages: [
        {
          id: 'g1',
          path: 'generated/okf/concept',
          title: 'Generated Concept',
          markdown: '# Generated Concept\n\nExplanation',
          spaceKind: 'generated',
        },
      ],
    });

    const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    const page = await db.query.pages.findFirst({
      where: eq(schema.pages.spaceId, space!.id),
    });
    expect(page).toBeTruthy();
    expect(page!.title).toBe('Generated Concept');
    expect(page!.nature).toBe('generated');

    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.pageId, page!.id),
    });
    expect(revision).toBeTruthy();
    expect(revision!.contentType).toBe('text/markdown');
  });
});
