/**
 * Minimal content-type sniffing for raw original bytes, in the style of
 * `image-validation.ts:sniffImageType` but broadened to the formats a raw entry
 * can carry. Returns the detected MIME type, or `null` when the bytes have no
 * reliable signature (plain text, logs, markdown) — in which case the caller
 * accepts the declared type as-is.
 */
export function sniffRawContentType(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  const head = bytes.toString('utf8', 0, Math.min(bytes.length, 512)).trimStart();
  const lowerHead = head.toLowerCase();
  if (lowerHead.startsWith('<!doctype html') || lowerHead.startsWith('<html') || lowerHead.startsWith('<body')) {
    return 'text/html';
  }
  const firstChar = head[0];
  if (firstChar === '{' || firstChar === '[') return 'application/json';
  return null;
}

/** Strip MIME parameters and normalize case so the stored/compared value is a
 * bare `type/subtype` matching the DB CHECK and the shared `mimeTypeSchema`. */
export function normalizeContentType(value: string): string {
  return value.split(';')[0]!.trim().toLowerCase();
}
