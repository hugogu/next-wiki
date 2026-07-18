import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { open, type Entry } from 'yauzl';
import { afterEach, describe, expect, it } from 'vitest';
import { TransferArtifactStore } from './artifact-store';
import { sha256 } from './manifest';
import { writeOkfArchive } from './okf-archive-writer';

let directory: string | null = null;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = null;
});

async function readZipEntry(filePath: string, name: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    open(filePath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('Unable to open ZIP'));
        return;
      }
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName !== name) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error('Unable to read ZIP entry'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            zip.close();
            resolve(Buffer.concat(chunks));
          });
        });
      });
      zip.on('end', () => reject(new Error(`Missing ZIP entry: ${name}`)));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

describe('OKF archive writer', () => {
  it('preserves concept frontmatter and rewrites only body asset URLs', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'next-wiki-okf-'));
    const store = new TransferArtifactStore(directory, 1024 * 1024);
    const assetId = '00000000-0000-0000-0000-000000000001';
    const image = Buffer.from('image');
    const imageHash = sha256(image);
    const source = [
      '---',
      'type: Service',
      'custom: preserved',
      '---',
      '',
      '# Payments',
      '',
      `![diagram](/api/assets/${assetId})`,
    ].join('\n');
    const result = await writeOkfArchive({
      storageKey: '00000000-0000-0000-0000-000000000099.zip',
      capturedAt: '2026-07-18T00:00:00.000Z',
      pages: [{
        id: 'page-1', revisionId: 'revision-1', path: 'concepts/payments', locale: 'en', title: 'Payments',
        markdown: source, contentHash: sha256(source), publishedAt: null,
        createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z', assetIds: [assetId],
      }],
      assets: [{
        id: assetId, contentHash: imageHash, contentType: 'image/png', sizeBytes: image.length, bytes: image,
      }],
      store,
    });

    const archivePath = path.join(directory, result.stored.storageKey);
    const markdown = (await readZipEntry(archivePath, 'pages/en/concepts/payments.md')).toString('utf8');
    expect(markdown).toContain('---\ntype: Service\ncustom: preserved\n---');
    expect(markdown).not.toContain('nextWikiArchiveVersion');
    expect(markdown).toContain(`![diagram](../../../assets/${imageHash}.png)`);
    await expect(readZipEntry(archivePath, `assets/${imageHash}.png`)).resolves.toEqual(image);
  });
});
