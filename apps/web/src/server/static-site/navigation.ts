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

export type LanguageOption = { locale: string; href: string };

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
    const { href } = pageAddress(baseUrl, page.path, page.locale, set.defaultLocale);
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
          ? pageAddress(baseUrl, ancestor.path, ancestor.locale, set.defaultLocale).href
          : null,
    });
  }
  return crumbs;
}

/**
 * Languages this page is actually available in.
 *
 * Only translations that are themselves publishable appear, so the switcher can
 * never offer a destination that does not exist (FR-025).
 */
export function buildLanguageOptions(
  set: PublishableSet,
  baseUrl: string,
  page: PublishablePage,
): LanguageOption[] {
  if (!page.translationGroupId) return [];
  const group = set.translationGroups.get(page.translationGroupId);
  if (!group) return [];

  return [...group.entries()]
    .filter(([locale]) => locale !== page.locale)
    .map(([locale, path]) => ({
      locale,
      href: pageAddress(baseUrl, path, locale, set.defaultLocale).href,
    }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
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
      const { href } = pageAddress(baseUrl, page.path, page.locale, set.defaultLocale);
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
