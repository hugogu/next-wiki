import { createHash } from 'node:crypto';
import { IMAGE_CONTENT_TYPES, type ImageContentType } from '@next-wiki/shared';
import { sanitizeSvg } from './svg-sanitize';

/**
 * Heuristically detect whether a buffer's leading bytes look like an SVG
 * document so it can be routed to the sanitizer. This only decides *routing*;
 * the sanitizer (which must emit a real `<svg>` root) is the authoritative gate,
 * so a loose match here cannot let unsanitized markup through.
 */
function looksLikeSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 2048).toString('utf8');
  // `\s` matches a leading UTF-8 BOM (U+FEFF) as well as ordinary whitespace.
  const start = head.replace(/^\s+/, '');
  const prefixOk =
    /^<\?xml[\s?]/i.test(start) ||
    /^<!doctype\s+svg\b/i.test(start) ||
    /^<svg[\s>]/i.test(start) ||
    /^<!--/.test(start);
  return prefixOk && /<svg[\s>/]/i.test(head);
}

/**
 * Detect an image type from its leading bytes. Raster types are matched by
 * magic numbers; SVG is matched structurally (it has no magic number). Returns
 * `null` for anything not in the allowlist — and for mislabeled files — so the
 * declared content type can never be trusted over the actual bytes (prevents
 * type confusion). SVG bytes are accepted only after sanitization in
 * `validateImage`, never on the strength of this sniff alone.
 */
export function sniffImageType(bytes: Buffer): ImageContentType | null {
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return 'image/gif';
  }
  if (bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (looksLikeSvg(bytes)) {
    return 'image/svg+xml';
  }
  return null;
}

export type ImageValidationResult =
  | {
      ok: true;
      contentType: ImageContentType;
      contentHash: string;
      sizeBytes: number;
      /**
       * Canonical bytes to persist. Identical to the input for rasters; the
       * sanitized SVG for `image/svg+xml`. Callers MUST store these, never the
       * original input, so the stored asset matches `contentHash`/`sizeBytes`.
       */
      bytes: Buffer;
    }
  | { ok: false; reason: 'too_large' | 'unsupported_type' };

/**
 * Validate uploaded image bytes against the size limit and the allowlist,
 * verifying the type from the bytes rather than the declared mime. SVG bytes
 * are sanitized and the sanitized form becomes the canonical stored bytes. On
 * success returns the canonical bytes plus the sniffed content type and the
 * sha256 (over the canonical bytes) used for integrity / migration / dedup.
 */
export function validateImage(bytes: Buffer, maxBytes: number): ImageValidationResult {
  if (bytes.length > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  const contentType = sniffImageType(bytes);
  if (!contentType || !IMAGE_CONTENT_TYPES.includes(contentType)) {
    return { ok: false, reason: 'unsupported_type' };
  }

  let canonical = bytes;
  if (contentType === 'image/svg+xml') {
    const sanitized = sanitizeSvg(bytes);
    if (!sanitized) {
      return { ok: false, reason: 'unsupported_type' };
    }
    // Sanitization only ever removes content, but guard the limit explicitly.
    if (sanitized.length > maxBytes) {
      return { ok: false, reason: 'too_large' };
    }
    canonical = sanitized;
  }

  const contentHash = createHash('sha256').update(canonical).digest('hex');
  return { ok: true, contentType, contentHash, sizeBytes: canonical.length, bytes: canonical };
}
