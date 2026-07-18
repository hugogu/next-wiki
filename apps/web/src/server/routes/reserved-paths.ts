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
