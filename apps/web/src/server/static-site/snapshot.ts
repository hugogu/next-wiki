import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { staticSiteBasePath, type StaticSiteExclusionCounts } from '@next-wiki/shared';
import { renderMarkdown } from '@/server/pipeline';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { extractHeadings, injectHeadingIds } from '@/lib/html';
import { getDictionary } from '@/i18n/server';
import { defaultLocale, isLocale, type UiLocale } from '@/i18n/config';
import { buildPublishableSet, type PublishableSet } from './eligibility';
import { describeConflict, findPathConflicts, pageAddress } from './paths';
import { rewriteAssetUrls, rewriteLinks } from './links';
import { exportAssets } from './assets';
import { buildSearchIndex } from './search-index';
import { markNonIndexableContent } from './indexing';
import {
  renderDocument,
  renderHomeDocument,
  renderNotFoundDocument,
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

  const conflicts = findPathConflicts(
    set.pages.map((page) => ({ path: page.path, locale: page.locale })),
    set.defaultLocale,
  );
  if (conflicts.length > 0) throw new PathConflictError(conflicts.map(describeConflict));

  await mkdir(rootDir, { recursive: true });

  const assets = await exportAssets(set, rootDir);
  const documents: { filePath: string; bytes: number }[] = [];
  let linksDowngraded = 0;
  const unresolvedAssets = new Set<string>();

  for (const page of set.pages) {
    // Read from the authoritative database: a publish must not stall on a slow
    // read-preferred replica, and the published source always lives in the DB.
    const source = await readMarkdownFromDatabase({
      id: page.revisionId,
      contentSource: page.contentSource,
    });
    const { html } = renderMarkdown(source);
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

    const address = pageAddress(baseUrl, page.path, page.locale, set.defaultLocale);
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
    });
    documents.push({
      filePath: address.filePath,
      bytes: await write(rootDir, address.filePath, document),
    });
  }

  // A remaining /api/assets reference would make the published site call back
  // to the wiki, breaking FR-020's self-containment guarantee.
  if (unresolvedAssets.size > 0) throw new UnresolvedAssetError([...unresolvedAssets]);

  const locales = publishedLocales(set);
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

  // One home page per language. A reader switching to a language this page has
  // no version in lands on that language's tree rather than on nothing, and it
  // costs one page per language rather than one per page per language.
  for (const locale of locales) {
    const isDefault = locale === set.defaultLocale;
    const filePath = isDefault ? 'index.html' : `${locale}/index.html`;
    const localeShell = {
      ...shell,
      locale,
      nav: buildNavTree(set, baseUrl, locale),
      strings: stringsFor(locale, siteName),
      canonicalUrl: `${origin}${localeHomeHref(baseUrl, locale, set.defaultLocale)}`,
      languages: locales
        .filter((other) => other !== locale)
        .map((other) => ({
          locale: other,
          href: localeHomeHref(baseUrl, other, set.defaultLocale),
          available: true,
        })),
    };
    documents.push({
      filePath,
      bytes: await write(
        rootDir,
        filePath,
        renderHomeDocument({ ...localeShell, title: siteName, description: siteName }),
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
        { ...shell, title: notFoundStrings.home, description: '' },
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

  // Runs last, over the finished HTML: the index is derived from the artifact
  // itself, which is what makes it inherit the content filter.
  if (!options.skipSearchIndex) await buildSearchIndex(rootDir);

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
