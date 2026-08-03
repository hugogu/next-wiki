import type { PublishableSet } from './eligibility';
import { addressKey } from './eligibility';
import { artifactHref, normalizePathSegments, pageAddress } from './paths';

/**
 * Rewrite the rendered HTML of one page so every reference resolves inside the
 * artifact — and so no reference discloses a page that was not published.
 *
 * Runs after `renderMarkdown()`, on the same anchors a reader would see. A link
 * to a page outside the publishable set becomes plain text carrying no address:
 * leaving the href would publish the path of a restricted page, which is a
 * disclosure even though the page itself is absent.
 */

const HREF_PATTERN = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
const ASSET_URL_PATTERN = /\/api\/(?:v1\/)?assets\/([0-9a-f-]{36})(?:\/content)?/gi;

/** Protocols that are not internal wiki references and are left untouched. */
const EXTERNAL_PREFIX = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i;

export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '';
  }
}

/**
 * Resolve a wiki-internal href against the publishable set.
 *
 * Returns the artifact address when the target is publishable, or null when it
 * is not — including when the link points at a page that never existed, since
 * both cases must render as inert text rather than a broken link.
 */
function resolveInternalHref(
  set: PublishableSet,
  baseUrl: string,
  rawHref: string,
  currentLocale: string,
): string | null {
  const withoutHash = rawHref.split('#')[0] ?? '';
  const fragment = rawHref.slice(withoutHash.length);
  const cleaned = normalizePathSegments(decodeURIComponent(withoutHash));

  if (cleaned === '') return fragment || null;

  // A leading two-letter segment is a locale prefix, matching the reader route.
  const segments = cleaned.split('/');
  const maybeLocale = segments[0] ?? '';
  const candidates: { locale: string; path: string }[] = [
    { locale: currentLocale, path: cleaned },
  ];
  if (/^[a-z]{2}$/.test(maybeLocale) && segments.length > 1) {
    candidates.unshift({ locale: maybeLocale, path: segments.slice(1).join('/') });
  }

  for (const candidate of candidates) {
    if (set.pageIdsByAddress.has(addressKey(candidate.locale, candidate.path))) {
      const { href } = pageAddress(baseUrl, candidate.path, candidate.locale, set.defaultLocale);
      return `${href}${fragment}`;
    }
  }
  return null;
}

/** Strip tags from a downgraded link's inner HTML, keeping its visible text. */
function inertText(inner: string): string {
  return inner.replace(/<[^>]+>/g, '');
}

export type LinkRewriteResult = {
  html: string;
  /** How many links were downgraded, for run diagnostics. */
  downgraded: number;
};

export function rewriteLinks(
  html: string,
  set: PublishableSet,
  baseUrl: string,
  currentLocale: string,
): LinkRewriteResult {
  let downgraded = 0;

  const rewritten = html.replace(
    HREF_PATTERN,
    (match, before: string, quote: string, href: string, after: string, inner: string) => {
      if (EXTERNAL_PREFIX.test(href)) return match;

      const resolved = resolveInternalHref(set, baseUrl, href, currentLocale);
      if (resolved === null) {
        downgraded += 1;
        // No href, no title, no data attributes — nothing that would let a
        // reader reconstruct where this used to point.
        return `<span class="text-muted" data-unpublished-link>${inertText(inner)}</span>`;
      }
      return `<a${before}href=${quote}${resolved}${quote}${after}>${inner}</a>`;
    },
  );

  return { html: rewritten, downgraded };
}

/**
 * Point image references at the artifact's asset directory.
 *
 * Assets not in the publishable set keep their original `/api/assets/...` URL,
 * which would call back to the wiki — so the caller must treat any remaining
 * match as an error rather than shipping it. `rewriteAssetUrls` reports them.
 */
export function rewriteAssetUrls(
  html: string,
  baseUrl: string,
  assetExtensions: Map<string, string>,
): { html: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const rewritten = html.replace(ASSET_URL_PATTERN, (match, assetId: string) => {
    const extension = assetExtensions.get(assetId);
    if (extension === undefined) {
      unresolved.push(assetId);
      return match;
    }
    return artifactHref(baseUrl, `_assets/${assetId}${extension}`);
  });
  return { html: rewritten, unresolved };
}
