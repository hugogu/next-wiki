import type { PublishableSet, PublishablePage } from './eligibility';
import { pageAddress } from './paths';

/**
 * Navigation data for the published site, derived entirely from the
 * publishable set.
 *
 * Nothing here queries the database. That is the point: a page absent from the
 * set has no way to appear in a tree, a breadcrumb, a sitemap, or a language
 * switcher, because none of those are built from anything else.
 */

export type NavNode = {
  title: string;
  /** Public address, or null for a synthetic folder that has no page of its own. */
  href: string | null;
  path: string;
  children: NavNode[];
};

export type Breadcrumb = { title: string; href: string | null };

export type LanguageOption = {
  locale: string;
  href: string;
  /** False when this page has no version in that language; the href then points
   *  at the language's own home page rather than nowhere. */
  available: boolean;
};

/**
 * Build the page tree for one locale.
 *
 * Intermediate path segments with no page of their own become synthetic
 * folders: the wiki allows `a/b/c` without `a/b` existing, and dropping those
 * levels would flatten the tree into something that does not match how the
 * author organized it.
 */
export function buildNavTree(set: PublishableSet, baseUrl: string, locale: string): NavNode[] {
  const pages = set.pages.filter((page) => page.locale === locale);
  const roots: NavNode[] = [];
  const byPath = new Map<string, NavNode>();

  const ensureNode = (path: string, title: string, href: string | null): NavNode => {
    const existing = byPath.get(path);
    if (existing) {
      if (href) {
        existing.href = href;
        existing.title = title;
      }
      return existing;
    }
    const node: NavNode = { title, href, path, children: [] };
    byPath.set(path, node);

    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
      roots.push(node);
    } else {
      const parentPath = path.slice(0, lastSlash);
      const parent = ensureNode(parentPath, parentPath.split('/').pop() ?? parentPath, null);
      parent.children.push(node);
    }
    return node;
  };

  for (const page of [...pages].sort((a, b) => a.path.localeCompare(b.path))) {
    // 035: the tree is still built from `path` (organizational structure);
    // only the leaf's href is the page's canonical `slug`-based address.
    const { href } = pageAddress(baseUrl, page.slug, page.locale, set.defaultLocale);
    ensureNode(page.path, page.title, href);
  }

  const sortTree = (nodes: NavNode[]): void => {
    nodes.sort((a, b) => a.path.localeCompare(b.path));
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);
  return roots;
}

/**
 * Breadcrumb trail for a page, derived from its path.
 *
 * An ancestor segment that is not itself a published page gets a null href
 * rather than a link to a page that does not exist — the site promises zero
 * dead internal links.
 */
export function buildBreadcrumbs(
  set: PublishableSet,
  baseUrl: string,
  page: PublishablePage,
): Breadcrumb[] {
  const segments = page.path.split('/');
  const crumbs: Breadcrumb[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    const ancestorPath = segments.slice(0, i + 1).join('/');
    const ancestor = set.pages.find(
      (candidate) => candidate.path === ancestorPath && candidate.locale === page.locale,
    );
    const isSelf = i === segments.length - 1;
    crumbs.push({
      title: ancestor?.title ?? segments[i]!,
      href:
        ancestor && !isSelf
          ? pageAddress(baseUrl, ancestor.slug, ancestor.locale, set.defaultLocale).href
          : null,
    });
  }
  return crumbs;
}

/**
 * Every language the site publishes, and where this page's reader should go for
 * each one.
 *
 * A reader can only be told a translation is missing if the switcher shows the
 * language at all (FR-025), so every published language appears. When this page
 * has a version in that language the link goes straight to it; when it does not,
 * the link goes to that language's home page — a real destination with that
 * language's full page tree — and the option is flagged so the shell can say
 * why.
 *
 * The alternative, generating a placeholder page per missing page-and-language
 * pair, would multiply the artifact by the number of languages to say something
 * the switcher can say in place.
 */
export function buildLanguageOptions(
  set: PublishableSet,
  baseUrl: string,
  page: PublishablePage,
): LanguageOption[] {
  const locales = publishedLocales(set);
  if (locales.length < 2) return [];

  const group = page.translationGroupId
    ? set.translationGroups.get(page.translationGroupId)
    : undefined;

  return locales
    .filter((locale) => locale !== page.locale)
    .map((locale) => {
      // 035: group values are the (shared, source) slug, not a tree path.
      const translatedSlug = group?.get(locale);
      return translatedSlug !== undefined
        ? {
            locale,
            href: pageAddress(baseUrl, translatedSlug, locale, set.defaultLocale).href,
            available: true,
          }
        : { locale, href: localeHomeHref(baseUrl, locale, set.defaultLocale), available: false };
    });
}

/** Home page address for one language. */
export function localeHomeHref(
  baseUrl: string,
  locale: string,
  defaultLocale: string,
): string {
  return pageAddress(baseUrl, '', locale === defaultLocale ? null : locale, defaultLocale).href;
}

/** Every locale that has at least one publishable page. */
export function publishedLocales(set: PublishableSet): string[] {
  return [...new Set(set.pages.map((page) => page.locale))].sort();
}

/** Sitemap over exactly the published addresses (FR-005). */
export function buildSitemap(set: PublishableSet, baseUrl: string): string {
  const origin = new URL(baseUrl).origin;
  const entries = set.pages
    .map((page) => {
      const { href } = pageAddress(baseUrl, page.slug, page.locale, set.defaultLocale);
      const lastmod = page.publishedAt ? page.publishedAt.toISOString() : null;
      return [
        '  <url>',
        `    <loc>${escapeXml(`${origin}${href}`)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
