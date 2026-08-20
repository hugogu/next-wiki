/**
 * Reserved-path validation for wiki pages.
 *
 * A wiki page is "reserved" if its path would be shadowed by a more specific
 * Next.js static route when visited. The set of reserved routes is **not**
 * hardcoded anywhere — it is computed at module load by walking the app/
 * directory (`./manifest.ts`). Adding a new app/ route automatically
 * protects that path; removing one automatically unprotects it.
 *
 * The route matcher handles the three Next.js segment flavors:
 *   - Literal: `api`, `healthz`, `new` — must equal the candidate segment.
 *   - Dynamic single: `[id]`, `[name]` — matches any single segment.
 *   - Catch-all: `[...path]` — matches the candidate's remaining segments.
 *
 * Anything matching under those rules means a wiki page at that path would
 * be inaccessible (the static route would win), so creation is rejected.
 */
import { DomainError } from '@/server/errors';
import { RESERVED_ROUTES } from './manifest';
import { RESERVED_PREFIXES as STATIC_SITE_RESERVED_PREFIXES, RESERVED_ROOT_FILES as STATIC_SITE_RESERVED_ROOT_FILES } from '@/server/static-site/paths';

/** A leading segment matching this shape is read as a translation's locale
 * (035) — mirrors `LOCALE_PREFIX_RE` in `services/reader-routing.ts` and the
 * identical guard in `services/space-routes.ts` for space prefixes. */
const LOCALE_SEGMENT_RE = /^[a-z]{2}$/;

/**
 * Returns true when every segment of `pattern` matches the candidate at the
 * corresponding position. Both arrays describe a full route from the URL
 * root; an empty pattern matches the root only.
 */
function routeMatches(pattern: readonly string[], candidate: readonly string[]): boolean {
  let p = 0;
  let c = 0;
  while (p < pattern.length) {
    const seg = pattern[p]!;
    if (seg.startsWith('[...')) {
      // Catch-all consumes the remainder of the candidate (one or more segments).
      return c < candidate.length;
    }
    if (seg.startsWith('[')) {
      // Dynamic single segment matches any single candidate segment.
      if (c >= candidate.length) return false;
      c += 1;
      p += 1;
      continue;
    }
    if (c >= candidate.length || candidate[c] !== seg) return false;
    c += 1;
    p += 1;
  }
  return c === candidate.length;
}

/**
 * Returns true if `path` would be shadowed by a static Next.js route. Paths
 * are compared as lowercase URL segments; callers should pass the
 * already-normalized canonical path (the same string that lives in
 * `pages.path` and survives `pathSchema`).
 */
export function isPathReserved(path: string): boolean {
  const segments = path.split('/');
  for (const route of RESERVED_ROUTES) {
    if (routeMatches(route.segments, segments)) return true;
  }
  return false;
}

/**
 * Throws `DomainError('PAGE_PATH_RESERVED', ...)` when the path is reserved.
 * Use this at every page-mutation chokepoint (create, rename, batch-create).
 */
export function assertPathNotReserved(path: string): void {
  if (isPathReserved(path)) {
    throw new DomainError(
      'PAGE_PATH_RESERVED',
      `Path "${path}" is reserved by built-in functionality. Please choose a different path.`,
    );
  }
}

/**
 * 035: why a public address (a canonical slug or an alias) may not be used.
 * Distinct from `isPathReserved` above — the tree `path` is an organizational
 * location that may legitimately start with any segment (including a
 * two-letter folder name), while an *address* occupies the same namespace the
 * reader route resolves, where a two-letter leading segment is read as a
 * translation locale and a small set of prefixes are reserved by the
 * published static site.
 */
export type AddressReservation =
  | { kind: 'built_in_route' }
  | { kind: 'locale_segment'; segment: string }
  | { kind: 'static_site_prefix'; segment: string };

/** Returns why `address` is reserved, or `null` when it is available. */
export function addressReservation(address: string): AddressReservation | null {
  if (isPathReserved(address)) return { kind: 'built_in_route' };
  const [firstSegment] = address.split('/');
  if (firstSegment && LOCALE_SEGMENT_RE.test(firstSegment)) {
    return { kind: 'locale_segment', segment: firstSegment };
  }
  if (firstSegment && (STATIC_SITE_RESERVED_PREFIXES as readonly string[]).includes(firstSegment)) {
    return { kind: 'static_site_prefix', segment: firstSegment };
  }
  if ((STATIC_SITE_RESERVED_ROOT_FILES as readonly string[]).includes(address)) {
    return { kind: 'static_site_prefix', segment: address };
  }
  return null;
}

export function isAddressReserved(address: string): boolean {
  return addressReservation(address) !== null;
}

/** Human-readable reason naming the violated rule (FR-015, FR-016). */
export function describeAddressReservation(reservation: AddressReservation): string {
  switch (reservation.kind) {
    case 'built_in_route':
      return 'This address is reserved by built-in application functionality.';
    case 'locale_segment':
      return `"${reservation.segment}" is reserved for translation addresses (a two-letter leading segment is read as a language code).`;
    case 'static_site_prefix':
      return `"${reservation.segment}" is reserved by the published static site.`;
  }
}
