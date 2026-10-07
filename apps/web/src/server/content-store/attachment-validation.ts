import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { AttachmentCategory } from '@next-wiki/shared';
import { sniffImageType } from './image-validation';

/**
 * The fixed FR-010 allowlist. This is a closed set, not an open denylist —
 * anything not recognized here is rejected regardless of admin
 * configuration. SVG is deliberately excluded: its existing image path
 * sanitizes bytes, which would violate attachments' byte-for-byte delivery
 * promise (FR-015).
 */
export type AttachmentContentType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'video/mp4'
  | 'video/webm'
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'text/csv'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/vnd.oasis.opendocument.text'
  | 'application/vnd.oasis.opendocument.spreadsheet'
  | 'application/vnd.oasis.opendocument.presentation';

const CATEGORY_BY_TYPE: Record<AttachmentContentType, AttachmentCategory> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'text/csv': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'application/vnd.oasis.opendocument.text': 'document',
  'application/vnd.oasis.opendocument.spreadsheet': 'document',
  'application/vnd.oasis.opendocument.presentation': 'document',
};

/** Declared-type fallback is only consulted for types with no reliable magic
 * number, and only ever resolves to one of these three literal values. */
const DECLARABLE_TYPES: ReadonlySet<AttachmentContentType> = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
]);

function sniffPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
}

function sniffMp4(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

function sniffWebm(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

function isZip(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

/**
 * Minimal ZIP reader — just enough to pull one named entry's bytes out of a
 * well-formed archive, so OOXML (Office Open XML) and ODF (OpenDocument) can
 * be told apart from an arbitrary ZIP file without a third-party library.
 * ZIP64 is intentionally unsupported: attachments are capped at 20 MB, far
 * below where ZIP64 extensions would ever be needed.
 */
function findEndOfCentralDirectory(bytes: Buffer): { cdOffset: number; cdSize: number } | null {
  const searchStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (i >= 0 && bytes.readUInt32LE(i) === EOCD_SIGNATURE) {
      return { cdOffset: bytes.readUInt32LE(i + 16), cdSize: bytes.readUInt32LE(i + 12) };
    }
  }
  return null;
}

function readLocalFileEntry(
  bytes: Buffer,
  localOffset: number,
  compressionMethod: number,
  compressedSize: number,
): Buffer | null {
  if (localOffset < 0 || localOffset + 30 > bytes.length) return null;
  if (bytes.readUInt32LE(localOffset) !== LOCAL_HEADER_SIGNATURE) return null;
  const nameLen = bytes.readUInt16LE(localOffset + 26);
  const extraLen = bytes.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  if (dataStart + compressedSize > bytes.length) return null;
  const raw = bytes.subarray(dataStart, dataStart + compressedSize);
  if (compressionMethod === 0) return Buffer.from(raw);
  if (compressionMethod === 8) {
    try {
      return inflateRawSync(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function readZipEntry(bytes: Buffer, entryName: string): Buffer | null {
  const eocd = findEndOfCentralDirectory(bytes);
  if (!eocd) return null;
  let offset = eocd.cdOffset;
  const end = eocd.cdOffset + eocd.cdSize;
  while (offset + 46 <= bytes.length && offset < end) {
    if (bytes.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) break;
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLen = bytes.readUInt16LE(offset + 28);
    const extraLen = bytes.readUInt16LE(offset + 30);
    const commentLen = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    if (name === entryName) {
      return readLocalFileEntry(bytes, localHeaderOffset, compressionMethod, compressedSize);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ODF_MIMETYPES: ReadonlySet<AttachmentContentType> = new Set([
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

/**
 * Distinguishes OOXML/ODF documents from an arbitrary ZIP file. ODF stores
 * an uncompressed `mimetype` entry (by spec, always the archive's first
 * entry) whose content is the exact MIME type string. OOXML instead ships a
 * `[Content_Types].xml` part declaring each root part's content type; the
 * word/sheet/presentation "main" content type identifies the package kind.
 */
function sniffZipDocumentType(bytes: Buffer): AttachmentContentType | null {
  const mimetype = readZipEntry(bytes, 'mimetype');
  if (mimetype) {
    const value = mimetype.toString('ascii').trim() as AttachmentContentType;
    if (ODF_MIMETYPES.has(value)) return value;
  }

  const contentTypes = readZipEntry(bytes, '[Content_Types].xml');
  if (contentTypes) {
    const xml = contentTypes.toString('utf8');
    if (xml.includes('wordprocessingml.document.main')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (xml.includes('spreadsheetml.sheet.main')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (xml.includes('presentationml.presentation.main')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
  }
  return null;
}

/**
 * Detect an attachment's type from its bytes (magic-byte sniffing, never
 * trusting a client-declared type over the bytes where sniffing is
 * possible), falling back to a declared type only for the fixed set of
 * formats with no reliable magic number. Returns `null` for anything
 * outside the FR-010 allowlist.
 */
export function sniffAttachmentType(
  bytes: Buffer,
  declaredContentType?: string,
): AttachmentContentType | null {
  const image = sniffImageType(bytes);
  if (image && image !== 'image/svg+xml') return image;
  if (sniffPdf(bytes)) return 'application/pdf';
  if (sniffMp4(bytes)) return 'video/mp4';
  if (sniffWebm(bytes)) return 'video/webm';
  if (isZip(bytes)) return sniffZipDocumentType(bytes);
  if (declaredContentType && DECLARABLE_TYPES.has(declaredContentType as AttachmentContentType)) {
    return declaredContentType as AttachmentContentType;
  }
  return null;
}

export type AttachmentValidationResult =
  | {
      ok: true;
      contentType: AttachmentContentType;
      category: AttachmentCategory;
      contentHash: string;
      sizeBytes: number;
      /** Always identical to the input — attachments are never
       * transformed; FR-015 requires a refusal instead of a silent
       * byte change. */
      bytes: Buffer;
    }
  | { ok: false; reason: 'too_large' | 'unsupported_type' };

/**
 * Validate uploaded attachment bytes against the configured size limit and
 * allowed categories. The whole buffer is measured before any store call is
 * made (FR-011a: reject in full, never truncate).
 */
export function validateAttachment(
  bytes: Buffer,
  maxBytes: number,
  allowedCategories: readonly AttachmentCategory[],
  declaredContentType?: string,
): AttachmentValidationResult {
  if (bytes.length > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  const contentType = sniffAttachmentType(bytes, declaredContentType);
  if (!contentType) {
    return { ok: false, reason: 'unsupported_type' };
  }

  const category = CATEGORY_BY_TYPE[contentType];
  if (!allowedCategories.includes(category)) {
    return { ok: false, reason: 'unsupported_type' };
  }

  const contentHash = createHash('sha256').update(bytes).digest('hex');
  return { ok: true, contentType, category, contentHash, sizeBytes: bytes.length, bytes };
}
