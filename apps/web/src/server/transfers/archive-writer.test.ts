import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TransferArtifactStore } from './artifact-store';
import { writePortableArchive } from './archive-writer';
import { inspectPortableArchive } from './archive-reader';
import { pageHistoryEntryPath, parsePage, sha256 } from './manifest';

let directory: string | null = null;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = null;
});

describe('portable archive writer', () => {
  it('writes a bounded ZIP with deterministic shared-asset inventory', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'next-wiki-transfer-'));
    const store = new TransferArtifactStore(directory, 1024 * 1024);
    const bytes = Buffer.from('image');
    const now = '2026-06-21T00:00:00.000Z';
    const page = (id: string, pathValue: string) => ({
      id,
      revisionId: `r-${id}`,
      path: pathValue,
      locale: 'en',
      title: pathValue,
      markdown: `![shared](/api/assets/00000000-0000-0000-0000-000000000001)`,
      contentHash: sha256(pathValue),
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      assetIds: ['00000000-0000-0000-0000-000000000001'],
      slug: pathValue,
      aliases: [] as { address: string; kind: 'retained' | 'manual' }[],
      spaceKind: 'wiki' as const,
      spaceSlug: 'default',
      markdownContentType: 'text/markdown',
    });
    const result = await writePortableArchive({
      storageKey: '00000000-0000-0000-0000-000000000099.zip',
      instanceId: 'instance',
      productVersion: '1',
      capturedAt: now,
      pages: [page('2', 'b'), page('1', 'a')],
      assets: [{
        id: '00000000-0000-0000-0000-000000000001',
        contentHash: sha256(bytes),
        contentType: 'image/png',
        sizeBytes: bytes.length,
        bytes,
      }],
      store,
    });
    expect(result.manifest.pages.map((item) => item.path)).toEqual(['a', 'b']);
    expect(result.manifest.assets).toHaveLength(1);
    expect(result.stored.contentHash).toHaveLength(64);
    expect((await readFile(path.join(directory, result.stored.storageKey))).byteLength).toBeGreaterThan(0);
  });

  it('scopes pages by space and deduplicates assets with identical bytes', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'next-wiki-transfer-'));
    const store = new TransferArtifactStore(directory, 1024 * 1024);
    const bytes = Buffer.from('shared asset');
    const assetIds = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];
    const page = (id: string, spaceKind: 'wiki' | 'generated', spaceSlug: string) => ({
      id,
      revisionId: `r-${id}`,
      path: 'memory/shared',
      locale: 'en',
      title: `${spaceKind} shared page`,
      markdown: `![shared](/api/assets/${assetIds[spaceKind === 'wiki' ? 0 : 1]})`,
      contentHash: sha256(id),
      publishedAt: null,
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
      assetIds: [assetIds[spaceKind === 'wiki' ? 0 : 1]!],
      slug: 'memory/shared',
      aliases: [] as { address: string; kind: 'retained' | 'manual' }[],
      spaceKind,
      spaceSlug,
      markdownContentType: 'text/markdown',
    });
    const result = await writePortableArchive({
      storageKey: '00000000-0000-0000-0000-000000000097.zip',
      instanceId: 'instance',
      productVersion: '1',
      capturedAt: '2026-06-21T00:00:00.000Z',
      pages: [page('wiki-page', 'wiki', 'default'), page('generated-page', 'generated', 'generated')],
      assets: [...assetIds].reverse().map((id) => ({
        id,
        contentHash: sha256(bytes),
        contentType: 'application/json',
        sizeBytes: bytes.length,
        bytes,
      })),
      store,
    });

    expect(result.manifest.pages.map((item) => item.entry).sort()).toEqual([
      'pages/generated/en/memory/shared.md',
      'pages/wiki/en/memory/shared.md',
    ]);
    expect(result.manifest.assets).toHaveLength(1);
    expect(new Set(result.manifest.files.map((file) => file.entry)).size).toBe(result.manifest.files.length);
    expect(result.manifest.snapshot.spaces).toEqual([
      { slug: 'generated', kind: 'generated', pageCount: 1 },
      { slug: 'default', kind: 'wiki', pageCount: 1 },
    ]);

    const inspected = await inspectPortableArchive(path.join(directory, result.stored.storageKey));
    for (const manifestPage of result.manifest.pages) {
      const body = await inspected.readEntry(manifestPage.entry);
      expect(body.toString('utf8')).toContain(`../../assets/${result.manifest.assets[0]!.id}.json`);
    }
  });

  it('writes a page\'s history entries as their own declared zip files', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'next-wiki-transfer-'));
    const store = new TransferArtifactStore(directory, 1024 * 1024);
    const now = '2026-06-21T00:00:00.000Z';
    const page = {
      id: 'page-1',
      revisionId: 'rev-current',
      path: 'docs/history',
      locale: 'en',
      title: 'Current title',
      markdown: '# current body',
      contentHash: sha256('current'),
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      assetIds: [],
      slug: 'docs/history',
      aliases: [] as { address: string; kind: 'retained' | 'manual' }[],
      spaceKind: 'wiki' as const,
      spaceSlug: 'default',
      markdownContentType: 'text/markdown',
      historyVersions: [
        {
          revisionId: 'rev-old',
          versionNumber: 1,
          markdown: '# old body',
          title: 'Old title',
          contentHash: sha256('old'),
          publishedAt: '2026-01-01T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          authorEmail: 'old-author@example.com',
          authorDisplayName: 'Old Author',
          contentType: null,
          originalAssetId: null,
        },
      ],
    };
    const result = await writePortableArchive({
      storageKey: '00000000-0000-0000-0000-000000000098.zip',
      instanceId: 'instance',
      productVersion: '1',
      capturedAt: now,
      pages: [page],
      assets: [],
      store,
    });

    const manifestPage = result.manifest.pages[0]!;
    expect(manifestPage.historyEntries).toHaveLength(1);
    const historyEntry = manifestPage.historyEntries![0]!;
    expect(historyEntry.entry).toBe(pageHistoryEntryPath('en', 'docs/history', 1, 'wiki'));
    expect(historyEntry.versionNumber).toBe(1);
    expect(historyEntry.revisionId).toBe('rev-old');
    expect(historyEntry.authorEmail).toBe('old-author@example.com');
    // Declared in files[] so archive-reader's undeclared-entry check passes.
    expect(result.manifest.files.some((f) => f.entry === historyEntry.entry)).toBe(true);

    const inspected = await inspectPortableArchive(path.join(directory, result.stored.storageKey));
    const bytes = await inspected.readEntry(historyEntry.entry);
    const parsed = parsePage(bytes.toString('utf8'));
    expect(parsed.frontmatter.versionNumber).toBe(1);
    expect(parsed.frontmatter.authorDisplayName).toBe('Old Author');
    expect(parsed.frontmatter.title).toBe('Old title');
    expect(parsed.markdown.trim()).toBe('# old body');
  });
});
