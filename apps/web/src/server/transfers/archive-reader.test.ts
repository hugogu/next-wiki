import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import {
  inspectPortableArchive,
  normalizeArchiveEntryName,
  type ArchiveLimits,
} from './archive-reader';
import { sha256 } from './manifest';

describe('archive reader path safety', () => {
  it.each([
    '../escape.md',
    '/absolute.md',
    'C:/drive.md',
    'pages\\evil.md',
    'pages/./evil.md',
    'pages//evil.md',
    'pages/\0evil.md',
  ])('rejects unsafe entry %s', (entry) => {
    expect(() => normalizeArchiveEntryName(entry)).toThrow();
  });

  it('normalizes a safe portable entry', () => {
    expect(normalizeArchiveEntryName('pages/en/docs/start.md')).toBe('pages/en/docs/start.md');
  });
});

const NOW = '2026-06-21T00:00:00.000Z';

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(tmpdir() + '/nw-archive-reader-');
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/** Collect a yazl zip into an in-memory Buffer. */
function finalize(zip: ZipFile): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}

async function writeZip(name: string, buffer: Buffer): Promise<string> {
  const filePath = `${tempDir}/${name}`;
  await writeFile(filePath, buffer);
  return filePath;
}

/**
 * yazl refuses to add unsafe metadata paths, so build the entry with a
 * same-length safe placeholder and patch the bytes (which appear verbatim in
 * the local and central headers) to smuggle the malicious path into the zip.
 */
async function zipWithRawPath(unsafePath: string): Promise<Buffer> {
  const placeholder = 'a'.repeat(Buffer.byteLength(unsafePath, 'latin1'));
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('x'), placeholder);
  const buffer = await finalize(zip);
  const from = Buffer.from(placeholder, 'latin1');
  const to = Buffer.from(unsafePath, 'latin1');
  for (let i = buffer.indexOf(from); i !== -1; i = buffer.indexOf(from, i + 1)) {
    to.copy(buffer, i);
  }
  return buffer;
}

function makeManifest(opts: {
  pages?: unknown[];
  assets?: unknown[];
  files?: { entry: string; sha256: string; sizeBytes: number }[];
}) {
  return {
    format: 'next-wiki-portable',
    version: 1,
    createdAt: NOW,
    source: { instanceId: 'test-instance', product: 'next-wiki', version: '1.0.0' },
    snapshot: { spaceSlug: 'default', capturedAt: NOW },
    counts: { pages: opts.pages?.length ?? 0, assets: opts.assets?.length ?? 0 },
    pages: opts.pages ?? [],
    assets: opts.assets ?? [],
    files: opts.files ?? [],
  };
}

const manifestJson = (files?: { entry: string; sha256: string; sizeBytes: number }[]) =>
  Buffer.from(JSON.stringify(makeManifest({ files }), null, 2));

describe('inspectPortableArchive malicious inputs', () => {
  it('rejects path traversal', async () => {
    await expect(
      inspectPortableArchive(await writeZip('traversal.zip', await zipWithRawPath('../escape.md'))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects an absolute path', async () => {
    await expect(
      inspectPortableArchive(await writeZip('absolute.zip', await zipWithRawPath('/etc/passwd'))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects a Windows drive-letter path', async () => {
    await expect(
      inspectPortableArchive(await writeZip('drive.zip', await zipWithRawPath('C:/secret.txt'))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects a backslash path', async () => {
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from('x'), 'pages\\evil.md');
    await expect(
      inspectPortableArchive(await writeZip('backslash.zip', await finalize(zip))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects a symlink entry', async () => {
    const linkBody = Buffer.from('/etc/passwd');
    const manifest = makeManifest({
      files: [{ entry: 'link.txt', sha256: sha256(linkBody), sizeBytes: linkBody.length }],
    });
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json');
    // mode 0o120777 marks the entry as a POSIX symlink; the reader rejects it.
    zip.addBuffer(linkBody, 'link.txt', { mode: 0o120777 });
    await expect(
      inspectPortableArchive(await writeZip('symlink.zip', await finalize(zip))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects duplicate normalized paths (case-insensitive identity)', async () => {
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from('a'), 'pages/en/docs.md');
    zip.addBuffer(Buffer.from('b'), 'pages/EN/docs.md');
    await expect(
      inspectPortableArchive(await writeZip('dupe.zip', await finalize(zip))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects an undeclared entry not present in the manifest', async () => {
    const zip = new ZipFile();
    zip.addBuffer(manifestJson(), 'manifest.json');
    zip.addBuffer(Buffer.from('evil'), 'evil.txt');
    await expect(
      inspectPortableArchive(await writeZip('undeclared.zip', await finalize(zip))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects a truncated archive', async () => {
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from('data'), 'manifest.json');
    const full = await finalize(zip);
    // Strip the trailing central directory so yauzl cannot open it.
    const truncated = full.subarray(0, full.length - 30);
    await expect(
      inspectPortableArchive(await writeZip('truncated.zip', truncated)),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects a zip bomb exceeding the compression-ratio limit', async () => {
    const zip = new ZipFile();
    // 50 KB of zeros compresses to a tiny payload -> ratio far exceeds the
    // default cap of 100.
    zip.addBuffer(Buffer.alloc(50_000, 0), 'bomb.bin');
    await expect(
      inspectPortableArchive(await writeZip('ratio.zip', await finalize(zip))),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects entries exceeding the expanded-byte limit', async () => {
    const limits: ArchiveLimits = {
      maxEntries: 100,
      maxExpandedBytes: 10_000,
      maxEntryBytes: 1_000_000,
      maxCompressionRatio: 1e9,
      maxFilenameBytes: 512,
    };
    const zip = new ZipFile();
    // Incompressible random data keeps the ratio low so only the expanded
    // total trips the limit.
    zip.addBuffer(randomBytes(20_000), 'big.bin');
    await expect(
      inspectPortableArchive(await writeZip('expanded.zip', await finalize(zip)), limits),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects an archive exceeding the entry-count limit', async () => {
    const limits: ArchiveLimits = {
      maxEntries: 3,
      maxExpandedBytes: 1_000_000,
      maxEntryBytes: 1_000_000,
      maxCompressionRatio: 1e9,
      maxFilenameBytes: 512,
    };
    const zip = new ZipFile();
    for (let i = 0; i < 4; i++) {
      zip.addBuffer(Buffer.from(String(i)), `f/${i}.txt`);
    }
    await expect(
      inspectPortableArchive(await writeZip('count.zip', await finalize(zip)), limits),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE' });
  });

  it('rejects a checksum mismatch on readEntry', async () => {
    const body = Buffer.from('hello world');
    const manifest = makeManifest({
      files: [{ entry: 'data.txt', sha256: '0'.repeat(64), sizeBytes: body.length }],
    });
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json');
    zip.addBuffer(body, 'data.txt');
    // Inspection succeeds (manifest valid, sizes match, all declared), but the
    // integrity check on readEntry catches the wrong sha256.
    const inspected = await inspectPortableArchive(
      await writeZip('checksum.zip', await finalize(zip)),
    );
    await expect(inspected.readEntry('data.txt')).rejects.toMatchObject({
      code: 'INVALID_ARCHIVE',
    });
  });
});
