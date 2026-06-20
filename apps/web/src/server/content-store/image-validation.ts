import { createHash } from 'node:crypto';
import { IMAGE_CONTENT_TYPES, type ImageContentType } from '@next-wiki/shared';

/**
 * Detect a raster image type from its leading bytes (magic numbers). Returns
 * `null` for anything not in the allowlist — including SVG and mislabeled files
 * — so the declared content type can never be trusted over the actual bytes
 * (prevents type confusion; SVG is excluded for safety, plan D3 / research R12).
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
  return null;
}

export type ImageValidationResult =
  | { ok: true; contentType: ImageContentType; contentHash: string; sizeBytes: number }
  | { ok: false; reason: 'too_large' | 'unsupported_type' };

/**
 * Validate uploaded image bytes against the size limit and the raster allowlist,
 * verifying the type from the bytes rather than the declared mime. On success
 * returns the sniffed content type and the sha256 used for integrity/migration
 * verification.
 */
export function validateImage(bytes: Buffer, maxBytes: number): ImageValidationResult {
  if (bytes.length > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  const contentType = sniffImageType(bytes);
  if (!contentType || !IMAGE_CONTENT_TYPES.includes(contentType)) {
    return { ok: false, reason: 'unsupported_type' };
  }
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  return { ok: true, contentType, contentHash, sizeBytes: bytes.length };
}
