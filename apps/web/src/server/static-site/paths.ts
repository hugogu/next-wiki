import { staticSiteBasePath } from '@next-wiki/shared';

/**
 * Address and filesystem layout for the published site.
 *
 * Two hazards drive this module. A static host serves files from a real
 * filesystem, so two wiki paths differing only in letter case collide there
 * even though they are distinct pages here. And the artifact needs a few
 * addresses of its own, which a page path could otherwise claim.
 */

/** Prefixes the artifact reserves for itself. A page path colliding with one of
 *  these is a hard error rather than a silent drop. */
export const RESERVED_PREFIXES = ['_static', '_assets', 'pagefind'] as const;

/** Root-level files the artifact writes. */
export const RESERVED_ROOT_FILES = [
  '.nojekyll',
  'index.html',
  '404.html',
  'sitemap.xml',
] as const;

export type PageAddress = {
  /** Path relative to the artifact root, e.g. `guides/setup/index.html`. */
  filePath: string;
  /** Public address including the base path, e.g. `/repo/guides/setup/`. */
  href: string;
};

/**
 * Normalize a wiki path for use as a directory name.
 *
 * NFC keeps composed and decomposed spellings of the same character from
 * becoming two directories — a real hazard for non-ASCII paths, where macOS
 * hands out NFD and most other sources hand out NFC.
 */
export function normalizePathSegments(path: string): string {
  return path
    .normalize('NFC')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('/');
}

/** Percent-encode a path for use in an href, preserving separators. */
export function encodeHrefPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Where a page is written and how it is addressed.
 *
 * Pages are emitted as `<path>/index.html` so the public address is the
 * directory form, matching the wiki's own reader URL for the same page.
 * Translations carry their locale as the first segment, the same convention the
 * reader route already resolves.
 */
export function pageAddress(
  baseUrl: string,
  path: string,
  locale: string | null,
  defaultLocale: string,
): PageAddress {
  const normalized = normalizePathSegments(path);
  const prefixed =
    locale && locale !== defaultLocale ? `${locale}/${normalized}` : normalized;
  const base = staticSiteBasePath(baseUrl);
  return {
    filePath: prefixed === '' ? 'index.html' : `${prefixed}/index.html`,
    href: prefixed === '' ? base : `${base}${encodeHrefPath(prefixed)}/`,
  };
}

/** Resolve an artifact-internal asset or resource reference against the base path. */
export function artifactHref(baseUrl: string, relativePath: string): string {
  return `${staticSiteBasePath(baseUrl)}${encodeHrefPath(relativePath.replace(/^\/+/, ''))}`;
}

export type PathConflict =
  | { kind: 'reserved'; path: string; reserved: string }
  | { kind: 'case'; path: string; conflictsWith: string };

/**
 * Find every path collision before anything is written.
 *
 * Detecting these up front and failing the whole run is deliberate: writing
 * some pages and then discovering the conflict would leave the operator with a
 * partially correct site and no clear signal about which page went missing.
 */
export function findPathConflicts(
  paths: { path: string; locale: string | null }[],
  defaultLocale: string,
): PathConflict[] {
  const conflicts: PathConflict[] = [];
  const seenLowercase = new Map<string, string>();

  for (const { path, locale } of paths) {
    const normalized = normalizePathSegments(path);
    const withLocale =
      locale && locale !== defaultLocale ? `${locale}/${normalized}` : normalized;
    const firstSegment = withLocale.split('/')[0] ?? '';

    const reserved = RESERVED_PREFIXES.find((prefix) => prefix === firstSegment);
    if (reserved) {
      conflicts.push({ kind: 'reserved', path: withLocale, reserved });
      continue;
    }
    if ((RESERVED_ROOT_FILES as readonly string[]).includes(withLocale)) {
      conflicts.push({ kind: 'reserved', path: withLocale, reserved: withLocale });
      continue;
    }

    const key = withLocale.toLowerCase();
    const existing = seenLowercase.get(key);
    if (existing !== undefined && existing !== withLocale) {
      conflicts.push({ kind: 'case', path: withLocale, conflictsWith: existing });
      continue;
    }
    seenLowercase.set(key, withLocale);
  }

  return conflicts;
}

/** Human-readable, operator-actionable description of a conflict. */
export function describeConflict(conflict: PathConflict): string {
  return conflict.kind === 'reserved'
    ? `Page path "${conflict.path}" collides with "${conflict.reserved}", which the published site reserves for its own files. Rename the page.`
    : `Page paths "${conflict.path}" and "${conflict.conflictsWith}" differ only in letter case, which a static host cannot distinguish. Rename one of them.`;
}
