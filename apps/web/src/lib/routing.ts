/**
 * Routing facts shared by `next.config.ts`, the proxy, and server services.
 *
 * Must stay dependency-free: `next.config.ts` imports it while Next reads its
 * own configuration, long before any server module (db, drizzle, `server-only`)
 * can be loaded.
 */

export const SESSION_COOKIE = 'next-wiki-session';

/**
 * The internal route authenticated readers are served from, so a registered or
 * restricted page never enters the anonymous ISR document cache. The external
 * URL is preserved — this prefix only ever appears in a rewrite destination.
 */
export const REGISTERED_READER_PREFIX = '/registered-reader';

/**
 * First URL segments that belong to application routing rather than wiki
 * content: every top-level route in `app/`, plus Next's own internals. A space
 * may not claim one as its route prefix, and the reader rewrite must not
 * capture one (`/registered-reader/admin/...` does not exist).
 */
export const RESERVED_ROUTE_PREFIXES = [
  '_next', '_static', '_vercel',
  'api', 'api-docs', 'admin', 'auth', 'edit', 'forbidden', 'h', 'healthz',
  'new', 'pages', 'readyz', 'registered-reader', 'revisions', 's', 'search',
  'setup', 'spaces', 'tags', 'user-center',
] as const;

/**
 * A public reader address: at least one segment, no segment carrying a file
 * extension (`.md` exports, `sitemap.xml`, static assets), and a first segment
 * that is not an application route prefix.
 */
const READER_PATH_PATTERN =
  `(?!(?:${RESERVED_ROUTE_PREFIXES.join('|')})(?:/|$))(?!.*\\.)[^/].*`;

/**
 * `next.config.ts` rewrite source for the authenticated reader.
 *
 * This is deliberately a config rewrite rather than a proxy rewrite: Next
 * strips the router's own headers before the proxy runs, so the proxy cannot
 * tell a prefetch from a navigation and its matcher has to exclude prefetches
 * wholesale to keep them out of the page audit log. A prefetch that skipped the
 * rewrite would fill the client Router Cache with the anonymous render of the
 * page — which is how a signed-in reader ended up seeing "access denied" for a
 * page they may read, until a hard reload. Routing therefore lives here, where
 * every request shape is matched, and only auditing stays in the proxy.
 */
export const READER_REWRITE_SOURCE = `/:readerPath(${READER_PATH_PATTERN})`;

/** Mirrors `READER_REWRITE_SOURCE` for tests and non-routing callers. */
export function isReaderRewritePath(pathname: string): boolean {
  return new RegExp(`^/(?:${READER_PATH_PATTERN})$`).test(pathname);
}
