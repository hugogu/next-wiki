import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  staticSiteBasePath,
  staticSiteCustomDomain,
  type StaticSiteExclusionCounts,
} from '@next-wiki/shared';
import { renderMarkdown } from '@/server/pipeline';
import { createStaticWikiLinkResolver } from '@/server/services/wiki-links';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { extractHeadings, injectHeadingIds } from '@/lib/html';
import { getDictionary } from '@/i18n/server';
import { defaultLocale, isLocale, type UiLocale } from '@/i18n/config';
import { buildPublishableSet, type PublishableSet } from './eligibility';
import { describeConflict, findPathConflicts, pageAddress } from './paths';
import { rewriteAssetUrls, rewriteLinks } from './links';
import { exportAssets } from './assets';
import { buildSearchIndex, chooseSearchLanguage } from './search-index';
import { markNonIndexableContent } from './indexing';
import {
  renderDocument,
  renderHomeDocument,
  renderNotFoundDocument,
  renderRedirectDocument,
  type DocumentAssets,
  type DocumentStrings,
} from './document';
import {
  buildBreadcrumbs,
  buildLanguageOptions,
  buildNavTree,
  buildSitemap,
  localeHomeHref,
  publishedLocales,
} from './navigation';

/**
 * Assemble one complete site snapshot into a directory.
 *
 * Everything is written into a temporary tree and verified before the caller
 * touches the delivery checkout, so a failure anywhere leaves the previously
 * published site untouched (FR-031).
 */

export class EmptySnapshotError extends Error {
  constructor() {
    super(
      'No page is currently eligible for publication, so publishing would replace the live site with an empty one. ' +
        'Check page visibility and space settings, or use the takedown action if removing the site is what you intend.',
    );
    this.name = 'EmptySnapshotError';
  }
}

export class PathConflictError extends Error {
  constructor(messages: string[]) {
    super(`The publishable pages have conflicting addresses:\n${messages.join('\n')}`);
    this.name = 'PathConflictError';
  }
}

export class UnresolvedAssetError extends Error {
  constructor(assetIds: string[]) {
    super(
      `Rendered pages reference ${assetIds.length} asset(s) that were not exported, which would leave the published site calling back to the wiki. Asset ids: ${assetIds.join(', ')}`,
    );
    this.name = 'UnresolvedAssetError';
  }
}

/** Fixed, content-hashed names produced by the build-time asset step. */
export const DEFAULT_DOCUMENT_ASSETS: DocumentAssets = {
  stylesheet: '_static/site.css',
  script: '_static/site.js',
  katexStylesheet: '_static/katex.css',
};

export type SnapshotManifest = {
  rootDir: string;
  basePath: string;
  documents: { filePath: string; bytes: number }[];
  pagesPublished: number;
  assetsPublished: number;
  pagesExcluded: number;
  exclusions: StaticSiteExclusionCounts;
  linksDowngraded: number;
  totalBytes: number;
  largestFileBytes: number;
};

export type SnapshotOptions = {
  /** Skipped in unit tests that do not need a real index built. */
  skipSearchIndex?: boolean;
  rootDir: string;
  baseUrl: string;
  siteName: string;
  themeCss: string;
  analyticsSnippet?: string | null;
  documentAssets?: DocumentAssets;
  /** Injected in tests; defaults to the real eligibility query. */
  publishableSet?: PublishableSet;
};

function stringsFor(locale: string, siteName: string): DocumentStrings {
  const uiLocale: UiLocale = isLocale(locale) ? locale : defaultLocale;
  const t = getDictionary(uiLocale);
  return {
    siteName,
    search: t('admin.staticSite.site.search'),
    translationMissing: t('admin.staticSite.site.translationMissing'),
    searchPlaceholder: t('admin.staticSite.site.searchPlaceholder'),
    home: t('admin.staticSite.site.home'),
    onThisPage: t('admin.staticSite.site.onThisPage'),
    toggleTheme: t('admin.staticSite.site.toggleTheme'),
    languages: t('admin.staticSite.site.languages'),
    noResults: t('admin.staticSite.site.noResults'),
  };
}

/** First paragraph of the rendered body, for the document description. */
function summarize(html: string): string {
  const match = /<p>([\s\S]*?)<\/p>/i.exec(html);
  const text = (match?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}

async function write(rootDir: string, relativePath: string, contents: string | Buffer) {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
  return Buffer.byteLength(contents as string);
}

export async function buildSnapshot(options: SnapshotOptions): Promise<SnapshotManifest> {
  const { rootDir, baseUrl, siteName, themeCss, analyticsSnippet } = options;
  const documentAssets = options.documentAssets ?? DEFAULT_DOCUMENT_ASSETS;
  const set = options.publishableSet ?? (await buildPublishableSet());
  const basePath = staticSiteBasePath(baseUrl);
  const origin = new URL(baseUrl).origin;

  // FR-004's full-replacement semantics mean an empty set would wipe a live
  // site. Removing the site is a legitimate operation, but it is a different
  // one, and it requires explicit confirmation — so an empty publish is a
  // failure rather than a silent takedown.
  if (set.pages.length === 0) throw new EmptySnapshotError();

  // 035: conflicts are checked over the published address space — every
  // canonical slug *and* every retained/manual alias together (contracts §6)
  // — not the organizational tree path, so a case-only collision between a
  // slug and an alias still fails the run before anything is written. Alias
  // addresses are already fully formed text (a translation's retained alias
  // carries its own locale prefix, per `setSlug`), so they pass `locale:
  // null` to skip the additional prefixing canonical slugs still need.
  const allAliases = [...set.aliasesByPageId.values()].flat();
  const conflicts = findPathConflicts(
    [
      ...set.pages.map((page) => ({ path: page.slug, locale: page.locale })),
      ...allAliases.map((address) => ({ path: address, locale: null })),
    ],
    set.defaultLocale,
  );
  if (conflicts.length > 0) throw new PathConflictError(conflicts.map(describeConflict));

  await mkdir(rootDir, { recursive: true });

  const assets = await exportAssets(set, rootDir);
  const documents: { filePath: string; bytes: number }[] = [];
  let linksDowngraded = 0;
  const unresolvedAssets = new Set<string>();

  const locales = publishedLocales(set);
  const searchLanguage = chooseSearchLanguage(locales);

  // Wikilinks resolve to a tree path, the shape `rewriteLinks` maps onto the
  // artifact's addresses — and only against pages of the same locale, which is
  // the locale that rewriter resolves in.
  const wikiLinkResolvers = new Map(
    locales.map((locale) => [
      locale,
      createStaticWikiLinkResolver(set.pages.filter((page) => page.locale === locale)),
    ]),
  );

  for (const page of set.pages) {
    // Read from the authoritative database: a publish must not stall on a slow
    // read-preferred replica, and the published source always lives in the DB.
    const source = await readMarkdownFromDatabase({
      id: page.revisionId,
      contentSource: page.contentSource,
    });
    const { html } = renderMarkdown(source, {
      resolveWikiLink: wikiLinkResolvers.get(page.locale),
    });
    const withIds = injectHeadingIds(html);
    const { html: withLinks, downgraded } = rewriteLinks(
      withIds,
      set,
      baseUrl,
      page.locale,
    );
    linksDowngraded += downgraded;
    const { html: withAssets, unresolved } = rewriteAssetUrls(
      withLinks,
      baseUrl,
      assets.extensions,
    );
    // Keep rendering instructions (LaTeX source, mermaid definitions) out of
    // the index so result excerpts read as prose.
    const bodyHtml = markNonIndexableContent(withAssets);
    for (const id of unresolved) unresolvedAssets.add(id);

    const address = pageAddress(baseUrl, page.slug, page.locale, set.defaultLocale);
    const document = renderDocument({
      title: page.title,
      bodyHtml,
      locale: page.locale,
      basePath,
      assets: documentAssets,
      themeCss,
      nav: buildNavTree(set, baseUrl, page.locale),
      breadcrumbs: buildBreadcrumbs(set, baseUrl, page),
      headings: extractHeadings(withIds),
      languages: buildLanguageOptions(set, baseUrl, page),
      strings: stringsFor(page.locale, siteName),
      canonicalUrl: `${origin}${address.href}`,
      description: summarize(bodyHtml),
      analyticsSnippet,
      searchLanguage,
    });
    documents.push({
      filePath: address.filePath,
      bytes: await write(rootDir, address.filePath, document),
    });

    // 035 (US4, contracts §6): one redirect stub per address alias. A static
    // host cannot issue a real 301 (research R12), so each alias gets its
    // own `<alias>/index.html` that immediately forwards to the canonical
    // href via `<meta http-equiv="refresh">`, with a `<link rel="canonical">`
    // for crawlers.
    for (const aliasAddress of set.aliasesByPageId.get(page.id) ?? []) {
      const aliasFile = pageAddress(baseUrl, aliasAddress, null, set.defaultLocale);
      const stub = renderRedirectDocument(`${origin}${address.href}`, siteName);
      documents.push({
        filePath: aliasFile.filePath,
        bytes: await write(rootDir, aliasFile.filePath, stub),
      });
    }
  }

  // A remaining /api/assets reference would make the published site call back
  // to the wiki, breaking FR-020's self-containment guarantee.
  if (unresolvedAssets.size > 0) throw new UnresolvedAssetError([...unresolvedAssets]);

  const homeLocale = locales.includes(set.defaultLocale) ? set.defaultLocale : locales[0]!;
  const shell = {
    locale: homeLocale,
    basePath,
    assets: documentAssets,
    themeCss,
    nav: buildNavTree(set, baseUrl, homeLocale),
    strings: stringsFor(homeLocale, siteName),
    canonicalUrl: `${origin}${basePath}`,
    analyticsSnippet,
  };

  // Every language's tree, largest first, for the site root. A wiki whose
  // content is mostly in one language but whose default locale is another would
  // otherwise open on a nearly empty page.
  const localeSections = locales
    .map((locale) => ({
      locale,
      label: new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale,
      count: set.pages.filter((page) => page.locale === locale).length,
      nav: buildNavTree(set, baseUrl, locale),
    }))
    .sort((a, b) => b.count - a.count);

  // One home page per language. A reader switching to a language this page has
  // no version in lands on that language's tree rather than on nothing, and it
  // costs one page per language rather than one per page per language.
  for (const locale of locales) {
    const isDefault = locale === set.defaultLocale;
    const filePath = isDefault ? 'index.html' : `${locale}/index.html`;
    const localeShell = {
      ...shell,
      locale,
      // No sidebar on a home page: its body already is the navigation, and a
      // sidebar showing only one language would suggest the site holds less
      // than it does.
      nav: [],
      strings: stringsFor(locale, siteName),
      canonicalUrl: `${origin}${localeHomeHref(baseUrl, locale, set.defaultLocale)}`,
      languages: locales
        .filter((other) => other !== locale)
        .map((other) => ({
          locale: other,
          href: localeHomeHref(baseUrl, other, set.defaultLocale),
          available: true,
        })),
      searchLanguage,
    };
    documents.push({
      filePath,
      bytes: await write(
        rootDir,
        filePath,
        renderHomeDocument({
          ...localeShell,
          title: siteName,
          description: siteName,
          // The site root surveys every language; a language's own home page
          // shows just that language.
          localeSections: isDefault
            ? localeSections
            : localeSections.filter((section) => section.locale === locale),
        }),
      ),
    });
  }

  const notFoundStrings = stringsFor(homeLocale, siteName);
  documents.push({
    filePath: '404.html',
    bytes: await write(
      rootDir,
      '404.html',
      renderNotFoundDocument(
        { ...shell, title: notFoundStrings.home, description: '', searchLanguage },
        getDictionary(isLocale(homeLocale) ? homeLocale : defaultLocale)(
          'admin.staticSite.site.notFound',
        ),
      ),
    ),
  });

  documents.push({
    filePath: 'sitemap.xml',
    bytes: await write(rootDir, 'sitemap.xml', buildSitemap(set, baseUrl)),
  });

  // Tells the host to serve files verbatim instead of running Jekyll, which is
  // what makes "no build step performed by the host" literally true — and stops
  // paths beginning with an underscore from being dropped.
  documents.push({ filePath: '.nojekyll', bytes: await write(rootDir, '.nojekyll', '') });

  // A custom domain is claimed by a file in the served branch. Since a publish
  // replaces that branch wholesale, omitting it would clear the domain the host
  // had configured — silently, on the first publish.
  const customDomain = staticSiteCustomDomain(baseUrl);
  if (customDomain) {
    documents.push({
      filePath: 'CNAME',
      bytes: await write(rootDir, 'CNAME', `${customDomain}\n`),
    });
  }

  // Runs last, over the finished HTML: the index is derived from the artifact
  // itself, which is what makes it inherit the content filter.
  if (!options.skipSearchIndex) await buildSearchIndex(rootDir, { forceLanguage: searchLanguage });

  const totalBytes = documents.reduce((sum, doc) => sum + doc.bytes, 0) + assets.bytes;
  const largestFileBytes = documents.reduce((max, doc) => Math.max(max, doc.bytes), 0);

  const excluded = Object.values(set.exclusions).reduce((sum, count) => sum + count, 0);

  return {
    rootDir,
    basePath,
    documents,
    pagesPublished: set.pages.length,
    assetsPublished: assets.count,
    pagesExcluded: excluded,
    exclusions: set.exclusions,
    linksDowngraded,
    totalBytes,
    largestFileBytes,
  };
}
