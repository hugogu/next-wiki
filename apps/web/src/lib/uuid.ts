/**
 * Generate an RFC 4122 v4 UUID string.
 *
 * Prefers `crypto.randomUUID()` (universally available in modern browsers in
 * both secure and non-secure contexts since Chrome 110 / Firefox 110 /
 * Safari 16.4 — Q1 2023).
 *
 * Falls back to `crypto.getRandomValues()` for the small minority of
 * environments that still strip `randomUUID` (some legacy user-agent
 * configurations, certain browser extensions' strict modes, or older
 * embedded WebViews). Last resort is a non-cryptographic `Math.random()`
 * implementation that keeps the page from crashing but should not be used
 * for security-sensitive identifiers.
 *
 * Prefer this helper over calling `crypto.randomUUID()` directly: direct
 * calls throw `TypeError: crypto.randomUUID is not a function` in the
 * environments listed above, breaking hydration on every page load.
 */
export function uuid(): string {
  const c =
    typeof globalThis !== 'undefined'
    ? (globalThis.crypto as Crypto | undefined)
    : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    const b6 = bytes[6] ?? 0;
    const b8 = bytes[8] ?? 0;
    bytes[6] = (b6 & 0x0f) | 0x40; // version 4
    bytes[8] = (b8 & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') +
      '-' +
      hex.slice(4, 6).join('') +
      '-' +
      hex.slice(6, 8).join('') +
      '-' +
      hex.slice(8, 10).join('') +
      '-' +
      hex.slice(10, 16).join('')
    );
  }
  // Non-cryptographic last-resort fallback. UUID-shaped, unique in practice
  // (collisions at 2^122 are negligible), but not suitable for security
  // sensitive identifiers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}