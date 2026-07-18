import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

type ImageNode = {
  type: 'image';
  url: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export type MarkdownImageReference = {
  url: string;
  start: number;
  end: number;
};

export function findMarkdownImages(markdown: string): MarkdownImageReference[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const results: MarkdownImageReference[] = [];
  visit(tree, 'image', (node) => {
    const image = node as ImageNode;
    const start = image.position?.start.offset;
    const end = image.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const raw = markdown.slice(start, end);
    const urlIndex = raw.indexOf(image.url);
    if (urlIndex < 0) return;
    results.push({
      url: image.url,
      start: start + urlIndex,
      end: start + urlIndex + image.url.length,
    });
  });
  return results;
}

export function extractLocalAssetIds(markdown: string): string[] {
  return [
    ...new Set(
      findMarkdownImages(markdown)
        .map(({ url }) => /^\/api\/assets\/([0-9a-f-]{36})(?:[?#].*)?$/i.exec(url)?.[1])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function rewriteMarkdownImages(
  markdown: string,
  replacer: (url: string) => string | null,
): string {
  const references = findMarkdownImages(markdown).sort((a, b) => b.start - a.start);
  let output = markdown;
  for (const reference of references) {
    const replacement = replacer(reference.url);
    if (replacement === null) continue;
    output = `${output.slice(0, reference.start)}${replacement}${output.slice(reference.end)}`;
  }
  return output;
}

export function portableAssetReference(pageEntry: string, assetEntry: string): string {
  const relative = path.posix.relative(path.posix.dirname(pageEntry), assetEntry);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

// ---------------------------------------------------------------------------
// 005: Wiki.js import — locale prefix stripping
// ---------------------------------------------------------------------------
// Wiki.js emits image (and page) URLs with a leading locale routing segment
// such as `/zh/...` or `/en-US/...`. next-wiki stores locale as page metadata
// and never uses URL routing prefixes, so the segment must be removed before
// the source URL is resolved against the Wiki.js base URL. Only ISO 639-1
// language codes are recognised so legitimate short top-level paths such as
// `/go/dashboard` or `/us/...` (a country code, not a language) are preserved.

const ISO_639_1_LANGUAGE_CODES = new Set([
  'aa', 'ab', 'ae', 'af', 'ak', 'am', 'an', 'ar', 'as', 'av', 'ay', 'az',
  'ba', 'be', 'bg', 'bi', 'bm', 'bn', 'bo', 'br', 'bs',
  'ca', 'ce', 'ch', 'co', 'cr', 'cs', 'cu', 'cv', 'cy',
  'da', 'de', 'dv', 'dz',
  'ee', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gn', 'gu', 'gv',
  'ha', 'he', 'hi', 'ho', 'hr', 'ht', 'hu', 'hy', 'hz',
  'ia', 'id', 'ie', 'ig', 'ii', 'ik', 'io', 'is', 'it', 'iu',
  'ja', 'jv',
  'ka', 'kg', 'ki', 'kj', 'kk', 'kl', 'km', 'kn', 'ko', 'kr', 'ks', 'ku', 'kv', 'kw', 'ky',
  'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv',
  'mg', 'mh', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'na', 'nb', 'nd', 'ne', 'ng', 'nl', 'nn', 'no', 'nr', 'nv', 'ny',
  'oc', 'oj', 'om', 'or', 'os',
  'pa', 'pi', 'pl', 'ps', 'pt',
  'qu',
  'rm', 'rn', 'ro', 'ru', 'rw',
  'sa', 'sc', 'sd', 'se', 'sg', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty',
  'ug', 'uk', 'ur', 'uz',
  've', 'vi', 'vo',
  'wa', 'wo',
  'xh',
  'yi', 'yo',
  'za', 'zh', 'zu',
]);

const LEADING_LOCALE_PATTERN = /^\/([a-z]{2})(?:-[a-z0-9]{2,3})?(?=\/|$)/i;

function stripLeadingLocale(pathname: string): string {
  const match = pathname.match(LEADING_LOCALE_PATTERN);
  if (!match) return pathname;
  if (!ISO_639_1_LANGUAGE_CODES.has(match[1]!.toLowerCase())) return pathname;
  const tail = pathname.slice(match[0].length);
  return tail === '' ? '/' : tail;
}

/**
 * Removes a leading ISO 639-1 locale routing prefix (optionally followed by a
 * BCP 47 region subtag) from a path or absolute URL. Absolute URLs are parsed
 * so the origin, query, and fragment are preserved; only the pathname is
 * rewritten. Inputs without a recognised locale prefix are returned unchanged.
 */
export function stripLocalePrefix(input: string): string {
  if (input === '') return '';
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      url.pathname = stripLeadingLocale(url.pathname);
      return url.toString();
    } catch {
      return input;
    }
  }
  return stripLeadingLocale(input);
}

// ---------------------------------------------------------------------------
// 010: AI Curation API — outbound link graph
// ---------------------------------------------------------------------------

type LinkNode = {
  type: 'link';
  url: string;
  children?: Array<{ value?: string }>;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export type MarkdownLink = {
  /** Obsidian-style `[[wikilink]]` vs a standard Markdown `[text](url)` link. */
  source: 'wiki' | 'markdown';
  /** Raw target as written: a relative/absolute page path, an API page URL, or a wikilink target. */
  target: string;
  linkText: string;
  /** `https://...` targets are not subject to the wiki's permission/resolution model. */
  external: boolean;
};

/** Finds standard Markdown links and returns their URL and byte positions. */
export function findMarkdownLinkReferences(markdown: string): MarkdownImageReference[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const results: MarkdownImageReference[] = [];
  visit(tree, 'link', (node) => {
    const link = node as LinkNode;
    const start = link.position?.start.offset;
    const end = link.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const raw = markdown.slice(start, end);
    const urlIndex = raw.indexOf(link.url);
    if (urlIndex < 0) return;
    results.push({
      url: link.url,
      start: start + urlIndex,
      end: start + urlIndex + link.url.length,
    });
  });
  return results;
}

/** Rewrites standard Markdown `[text](url)` links in place. */
export function rewriteMarkdownLinks(
  markdown: string,
  replacer: (url: string) => string | null,
): string {
  const references = findMarkdownLinkReferences(markdown).sort((a, b) => b.start - a.start);
  let output = markdown;
  for (const reference of references) {
    const replacement = replacer(reference.url);
    if (replacement === null) continue;
    output = `${output.slice(0, reference.start)}${replacement}${output.slice(reference.end)}`;
  }
  return output;
}

/**
 * Creates a replacer that normalises internal Wiki.js links. Same-origin
 * absolute URLs are converted to root-relative paths so imported links point to
 * the new wiki rather than the source host, and locale routing prefixes are
 * stripped. When `pagePath` is supplied, relative links (e.g. `solar-system`)
 * are resolved against it: Wiki.js treats a page's own path as the base
 * directory, so a link written on `/astronomy` resolves to `/astronomy/...`
 * rather than the site root. External URLs, anchors, and non-http schemes
 * (`mailto:`, `tel:`, …) are left untouched.
 */
export function createWikiJsLinkReplacer(
  baseUrl: string,
  pagePath?: string,
): (url: string) => string | null {
  const baseUrlOrigin = new URL(baseUrl).origin;
  return (url) => {
    if (/^https?:\/\//i.test(url)) {
      try {
        const parsed = new URL(url);
        if (parsed.origin !== baseUrlOrigin) return null;
        // Strip the locale prefix from the pathname only, then re-append the
        // query and fragment. Stripping the concatenated `pathname + search +
        // hash` would miss a locale that is the entire pathname when followed
        // by `?` or `#` (e.g. `/zh?x=1`), because the leading-locale lookahead
        // only matches a trailing `/` or end-of-string.
        const strippedPath = stripLeadingLocale(parsed.pathname);
        return strippedPath + parsed.search + parsed.hash;
      } catch {
        return null;
      }
    }
    // Root-relative path: only the locale prefix needs stripping.
    if (url.startsWith('/')) {
      const stripped = stripLocalePrefix(url);
      return stripped === url ? null : stripped;
    }
    // Anchors, protocol-relative URLs, and scheme links (mailto:, tel:, …) are
    // not page paths — leave them as-is.
    if (url === '' || url.startsWith('#') || url.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
      return null;
    }
    // Relative page link: resolve it against the source page's path. Without a
    // page path we cannot resolve it, so leave it unchanged.
    if (!pagePath) return null;
    const [, pathPart = '', suffix = ''] = /^([^?#]*)([?#].*)?$/.exec(url) ?? [];
    if (pathPart === '') return null;
    // Anchor at root so `..` segments can never escape above the wiki root.
    const resolved = path.posix.normalize(path.posix.join('/', pagePath, pathPart));
    return resolved + suffix;
  };
}

const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Finds standard Markdown links and `[[wikilink]]` / `[[wikilink|alias]]` references. */
export function findMarkdownLinks(markdown: string): MarkdownLink[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const results: MarkdownLink[] = [];
  visit(tree, 'link', (node) => {
    const link = node as LinkNode;
    const linkText = (link.children ?? []).map((child) => child.value ?? '').join('');
    results.push({
      source: 'markdown',
      target: link.url,
      linkText: linkText || link.url,
      external: /^https?:\/\//i.test(link.url),
    });
  });
  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const target = match[1]!.trim();
    const alias = match[2]?.trim();
    results.push({ source: 'wiki', target, linkText: alias || target, external: false });
  }
  return results;
}

/** Reads the `related_pages` frontmatter key, if present and shaped as a string array. */
export function findFrontmatterRelatedPages(frontmatter: Record<string, unknown> | null): string[] {
  const related = frontmatter?.related_pages;
  if (!Array.isArray(related)) return [];
  return related.filter((entry): entry is string => typeof entry === 'string');
}
