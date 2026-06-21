import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TransferArtifactStore } from './artifact-store';
import { writePortableArchive } from './archive-writer';
import { sha256 } from './manifest';

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
    });
    const result = await writePortableArchive({
      storageKey: '00000000-0000-0000-0000-000000000099.zip',
      instanceId: 'instance',
      productVersion: '1',
      spaceSlug: 'default',
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
});
