/**
 * Generate an RFC 4122 v4 UUID string.
 *
 * `crypto.randomUUID()` is spec'd as a secure-context-only API: browsers
 * expose it on `https:` origins and on `localhost`, but not on a plain
 * `http://` origin reached by IP or hostname (e.g. a LAN deployment at
 * `http://192.168.x.x:3000`) — regardless of how new the browser is. Calling
 * it directly there throws `TypeError: crypto.randomUUID is not a function`
 * on every page load, including hydration.
 *
 * Falls back to `crypto.getRandomValues()`, which has no such restriction and
 * is available in every context that has `randomUUID` plus every insecure
 * `http://` context. Math.random() is a last-resort, non-cryptographic
 * fallback for the (currently theoretical) case where neither exists.
 *
 * Prefer this helper over calling `crypto.randomUUID()` directly in
 * first-party client code.
 */
export function uuid(): string {
  const c =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
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
