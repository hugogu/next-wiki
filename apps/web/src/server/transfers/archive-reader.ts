import { createHash } from 'node:crypto';
import { open, type Entry, type ZipFile } from 'yauzl';
import {
  portableArchiveManifestSchema,
  type PortableArchiveManifest,
} from '@next-wiki/shared';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';

export type ArchiveLimits = {
  maxEntries: number;
  maxExpandedBytes: number;
  maxEntryBytes: number;
  maxCompressionRatio: number;
  maxFilenameBytes: number;
};

const DEFAULT_LIMITS: ArchiveLimits = {
  maxEntries: env.TRANSFER_MAX_ENTRIES,
  maxExpandedBytes: env.TRANSFER_MAX_EXPANDED_BYTES,
  maxEntryBytes: Math.max(env.TRANSFER_MAX_MARKDOWN_BYTES, env.CONTENT_ASSET_MAX_BYTES),
  maxCompressionRatio: env.TRANSFER_MAX_COMPRESSION_RATIO,
  maxFilenameBytes: 512,
};

function invalid(message: string): never {
  throw new DomainError('INVALID_ARCHIVE', message);
}

export function normalizeArchiveEntryName(value: string): string {
  if (
    value.length === 0 ||
    Buffer.byteLength(value) > 512 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    invalid('Archive contains an unsafe entry path');
  }
  const normalized = value.normalize('NFC');
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    invalid('Archive contains an unsafe entry path');
  }
  return normalized;
}

function openZip(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    open(filePath, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Unable to open ZIP'));
      else resolve(zip);
    });
  });
}

function isSymlink(entry: Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

async function scanEntries(filePath: string, limits: ArchiveLimits) {
  const zip = await openZip(filePath);
  return new Promise<Map<string, Entry>>((resolve, reject) => {
    const entries = new Map<string, Entry>();
    let expanded = 0;
    zip.on('entry', (entry: Entry) => {
      try {
        if (/\/$/.test(entry.fileName)) invalid('Directory entries are not allowed');
        const name = normalizeArchiveEntryName(entry.fileName);
        const identity = name.toLocaleLowerCase('en-US');
        if ([...entries.keys()].some((item) => item.toLocaleLowerCase('en-US') === identity)) {
          invalid('Archive contains duplicate normalized entry paths');
        }
        if (isSymlink(entry)) invalid('Symbolic links are not allowed');
        if (entries.size + 1 > limits.maxEntries) invalid('Archive has too many entries');
        if (entry.uncompressedSize > limits.maxEntryBytes && name !== 'manifest.json') {
          invalid('Archive entry exceeds the configured size limit');
        }
        const ratio = entry.compressedSize === 0
          ? entry.uncompressedSize
          : entry.uncompressedSize / entry.compressedSize;
        if (ratio > limits.maxCompressionRatio) invalid('Archive compression ratio is unsafe');
        expanded += entry.uncompressedSize;
        if (expanded > limits.maxExpandedBytes) invalid('Archive expanded size is too large');
        entries.set(name, entry);
        zip.readEntry();
      } catch (error) {
        zip.close();
        reject(error);
      }
    });
    zip.on('end', () => {
      zip.close();
      resolve(entries);
    });
    zip.on('error', reject);
    zip.readEntry();
  });
}

async function readNamedEntry(filePath: string, entryName: string, maxBytes: number): Promise<Buffer> {
  const zip = await openZip(filePath);
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    zip.on('entry', (entry: Entry) => {
      if (entry.fileName !== entryName) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('Unable to read ZIP entry'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) stream.destroy(new Error('Archive entry exceeds limit'));
          else chunks.push(chunk);
        });
        stream.on('error', reject);
        stream.on('end', () => {
          settled = true;
          zip.close();
          resolve(Buffer.concat(chunks));
        });
      });
    });
    zip.on('end', () => {
      if (!settled) reject(new Error(`Archive entry not found: ${entryName}`));
    });
    zip.on('error', reject);
    zip.readEntry();
  });
}

export async function inspectPortableArchive(
  filePath: string,
  limits: ArchiveLimits = DEFAULT_LIMITS,
): Promise<{
  manifest: PortableArchiveManifest;
  readEntry: (entry: string, maxBytes?: number) => Promise<Buffer>;
}> {
  let entries: Map<string, Entry>;
  try {
    entries = await scanEntries(filePath, limits);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_ARCHIVE', 'Archive is truncated or malformed');
  }
  if (!entries.has('manifest.json')) invalid('Archive manifest is missing');
  const manifestBytes = await readNamedEntry(filePath, 'manifest.json', 10 * 1024 * 1024);
  let manifest: PortableArchiveManifest;
  try {
    manifest = portableArchiveManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  } catch {
    throw new DomainError('INVALID_ARCHIVE', 'Archive manifest is invalid');
  }
  const declared = new Set(['manifest.json', ...manifest.files.map((file) => file.entry)]);
  for (const name of entries.keys()) {
    if (!declared.has(name)) invalid(`Archive contains undeclared entry: ${name}`);
  }
  for (const file of manifest.files) {
    const entry = entries.get(file.entry);
    if (!entry) invalid(`Archive is missing declared entry: ${file.entry}`);
    if (entry.uncompressedSize !== file.sizeBytes) invalid(`Archive size mismatch: ${file.entry}`);
  }
  return {
    manifest,
    readEntry: async (entry, maxBytes = limits.maxEntryBytes) => {
      const descriptor = manifest.files.find((file) => file.entry === entry);
      if (!descriptor) invalid('Requested archive entry is not declared');
      const bytes = await readNamedEntry(filePath, entry, maxBytes);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== descriptor.sha256) invalid(`Archive checksum mismatch: ${entry}`);
      return bytes;
    },
  };
}
