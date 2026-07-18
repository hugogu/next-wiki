/**
 * Auto-discovers every static Next.js app/ route at module load. The result
 * is the runtime source-of-truth for "reserved" wiki paths — anything that
 * shadows the wiki catch-all reader because it has a more specific static
 * match. Nothing here is hardcoded; the list is computed by walking the
 * `app/` directory, so adding a new route automatically protects it.
 *
 * The walk skips:
 *   - The wiki catch-all `app/(public)/[...path]` (it IS the wiki reader).
 *   - Route groups like `(public)`, `(admin)`, `(user)` — they are
 *     transparent in the URL.
 *   - Underscore-prefixed directories (`_next`, etc.).
 *   - Dynamic single segments like `[id]` — they don't conflict on their own,
 *     but their literal siblings are still collected.
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, '..', '..', '..', 'app');

interface RouteEntry {
  /** URL segments, e.g. `['api', 'v1', 'pages', '[id]']`. */
  segments: string[];
}

/** Recursively walk the app/ directory and collect every route defined by a
 * `page.tsx` or `route.ts`. Skips the wiki catch-all itself. */
function walk(dir: string, segments: string[], into: RouteEntry[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  const hasPage = entries.includes('page.tsx');
  const hasRoute = entries.includes('route.ts');
  if (hasPage || hasRoute) {
    into.push({ segments: [...segments] });
  }

  for (const entry of entries) {
    if (entry === 'page.tsx' || entry === 'route.ts' || entry === 'layout.tsx') continue;
    if (entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    // Route groups — `(public)`, `(admin)`, `(user)` — are transparent; they
    // don't contribute a URL segment.
    if (entry.startsWith('(') && entry.endsWith(')')) {
      walk(fullPath, segments, into);
      continue;
    }

    // Underscore-prefixed dirs (Next.js private folders).
    if (entry.startsWith('_')) continue;

    walk(fullPath, [...segments, entry], into);
  }
}

/** Reads the app/ directory once at module load. Throws a descriptive error
 * if it can't find the app directory so a misconfigured deployment fails
 * loudly instead of silently allowing all paths. */
function discoverRoutes(): RouteEntry[] {
  const out: RouteEntry[] = [];
  try {
    const stat = statSync(APP_DIR);
    if (!stat.isDirectory()) {
      throw new Error(`not a directory: ${APP_DIR}`);
    }
  } catch (error) {
    throw new Error(
      `Reserved-route discovery could not find the Next.js app/ directory at ${APP_DIR} ` +
        `(resolved from ${HERE}). Set up the project layout or update the path. ` +
        `Original error: ${(error as Error).message}`,
    );
  }
  walk(APP_DIR, [], out);
  return out;
}

const ALL_ROUTES = discoverRoutes();

/** The wiki catch-all reader is excluded so it never conflicts with itself. */
const WIKI_CATCHALL_SEGMENTS = new Set(['[...path]']);

export const RESERVED_ROUTES: RouteEntry[] = ALL_ROUTES.filter(
  (entry) => !entry.segments.every((seg) => WIKI_CATCHALL_SEGMENTS.has(seg)),
);

/** Snapshot for diagnostics — number of static routes discovered. */
export const RESERVED_ROUTE_COUNT = RESERVED_ROUTES.length;
