import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { PageMetadata } from '@/components/pages/PageMetadata';
import { PageSidebar } from '@/components/pages/PageSidebar';
import { ShareButton } from '@/components/pages/ShareButton';
import { ProvenanceIndicators } from '@/components/pages/ProvenanceIndicators';
import * as pageService from '@/server/services/pages';
import { extractHeadings, injectHeadingIds } from '@/lib/html';
import type { LivePage } from '@next-wiki/shared';
import { buildAnonymousCtx, type PermCtx } from '@/server/permissions';
import { getPageHref, getPagePathFromParams, getTranslatedPageHref } from '@/lib/path';
import { buildPageDescription } from '@/lib/seo';
import { getDictionary, getStaticLocale } from '@/i18n/server';
import { createAppFormatter } from '@/i18n/formatter';
import { env } from '@/server/config';

// Published reader pages are generated on their first visit and then served as
// ISR. Session-specific controls hydrate in the shell after the document is
// delivered, so cookies and headers must not make the document body dynamic.
export const dynamic = 'force-static';
export const revalidate = 300;
export const dynamicParams = true;

/**
 * Do not enumerate the database at build time: self-hosted image builds do not
 * have a database connection. `dynamicParams` keeps every published path
 * eligible for on-demand ISR generation after deployment.
 */
export async function generateStaticParams(): Promise<{ path: string[] }[]> {
  return [];
}

type PageParams = Promise<{ path: string[] }>;

const LOCALE_PREFIX_RE = /^[a-z]{2}$/;

type Resolved =
  | { kind: 'original'; page: LivePage; sourcePath: string }
  | { kind: 'translation'; page: LivePage; locale: string; sourcePath: string }
  | { kind: 'unavailable'; locale: string; sourcePath: string }
  | { kind: 'not_found' };

/**
 * Resolve a catch-all reader address. A leading two-letter segment is tried as
 * a translation language first; a genuine source page whose first path segment
 * happens to look like a locale still wins because unmatched translation
 * attempts fall through to original resolution of the full path (content-routing
 * contract — originals keep precedence).
 */
async function resolve(ctx: PermCtx, rawSegments: string[]): Promise<Resolved> {
  const isAnonymous = ctx.actor.kind === 'anonymous';
  const segments = rawSegments.map((s) => decodeURIComponent(s));
  const fullPath = segments.join('/');

  if (segments.length >= 2 && LOCALE_PREFIX_RE.test(segments[0]!)) {
    const locale = segments[0]!;
    const sourcePath = segments.slice(1).join('/');
    const result = isAnonymous
      ? await pageService.getCachedPublicLiveTranslation(locale, sourcePath)
      : await pageService.getLiveTranslation(ctx, locale, sourcePath);
    if (result.kind === 'page') {
      return { kind: 'translation', page: result.page, locale, sourcePath };
    }
    if (result.kind === 'unavailable') {
      return { kind: 'unavailable', locale, sourcePath: result.sourcePath };
    }
    // not_found → fall through to original resolution below.
  }

  const original = isAnonymous
    ? await pageService.getCachedPublicLivePage(fullPath)
    : await pageService.getLive(ctx, fullPath);
  return original ? { kind: 'original', page: original, sourcePath: fullPath } : { kind: 'not_found' };
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const [raw, locale] = await Promise.all([params, getStaticLocale()]);
  const t = getDictionary(locale);
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  // Anonymous context so crawlers see the same metadata logged-out visitors do.
  const resolved = await resolve(buildAnonymousCtx(), raw.path);

  if (resolved.kind === 'not_found' || resolved.kind === 'unavailable') {
    const path = getPagePathFromParams(raw);
    return { title: path, robots: { index: false, follow: true } };
  }

  const { page } = resolved;
  if (page.status !== 'published') {
    return { title: page.title, robots: { index: false, follow: true } };
  }

  const isTranslation = resolved.kind === 'translation';
  const canonicalPath = isTranslation
    ? getTranslatedPageHref(resolved.locale, resolved.sourcePath)
    : getPageHref(resolved.sourcePath);
  const description = buildPageDescription(page.contentHtml, t('site.description'));

  // hreflang alternates: the original plus every published translation in the
  // group. Original is the default alternate, never a redirect target.
  const translatedLocales = await pageService.getCachedPublishedTranslationLocales(resolved.sourcePath);
  const languages: Record<string, string> = {
    'x-default': `${siteUrl}${getPageHref(resolved.sourcePath)}`,
  };
  for (const loc of translatedLocales) {
    languages[loc] = `${siteUrl}${getTranslatedPageHref(loc, resolved.sourcePath)}`;
  }

  return {
    title: page.title,
    description,
    alternates: { canonical: `${siteUrl}${canonicalPath}`, languages },
    openGraph: {
      type: 'article',
      url: `${siteUrl}${canonicalPath}`,
      title: page.title,
      description,
      siteName: t('common.brand'),
      locale: isTranslation && resolved.locale === 'zh' ? 'zh_CN' : locale === 'zh' ? 'zh_CN' : 'en_US',
      ...(page.publishedAt ? { publishedTime: page.publishedAt } : {}),
      ...(page.authorDisplayName ? { authors: [page.authorDisplayName] } : {}),
    },
    twitter: { card: 'summary_large_image', title: page.title, description },
    robots: { index: true, follow: true },
  };
}

export default async function PageRead({ params }: { params: PageParams }) {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);
  const raw = await params;
  // This route has a single anonymous published representation. Authenticated
  // actions are fetched by AppShell after hydration and remain protected by
  // their server endpoints.
  const actor = buildAnonymousCtx().actor;
  const resolved = await resolve({ actor }, raw.path);

  if (resolved.kind === 'not_found') notFound();

  if (resolved.kind === 'unavailable') {
    // Localized empty/in-progress state for an authorized source reader. Never
    // substitutes another language or the original as translated output.
    return (
      <Layout staticPublic>
        <article className="flex-1 px-lg py-2xl max-w-none text-center">
          <h1 className="text-xl font-semibold mb-sm">{t('translation.reader.unavailable.title')}</h1>
          <p className="text-muted mb-lg">{t('translation.reader.unavailable.body')}</p>
          <a className="text-primary underline" href={getPageHref(resolved.sourcePath)}>
            {t('errors.notFound.backHome')}
          </a>
        </article>
      </Layout>
    );
  }

  const { page } = resolved;
  const isTranslation = resolved.kind === 'translation';
  // Editing/history controls target the original; a translation is read-only.
  const canEdit = !isTranslation && (await pageService.canCreate({ actor }));
  const isAuthor = actor.kind === 'user' ? page.authorId === actor.userId : false;
  const canPublish =
    !isTranslation &&
    page.status === 'draft' &&
    (canEdit || isAuthor || (actor.kind === 'user' && actor.role === 'admin'));

  const createdAt = new Date(page.createdAt);
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  const canonicalPath = isTranslation
    ? getTranslatedPageHref(resolved.locale, resolved.sourcePath)
    : getPageHref(resolved.sourcePath);
  const jsonLd =
    page.status === 'published'
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: page.title,
          description: buildPageDescription(page.contentHtml, ''),
          mainEntityOfPage: `${siteUrl}${canonicalPath}`,
          datePublished: page.publishedAt ?? undefined,
          dateModified: page.publishedAt ?? undefined,
          ...(page.authorDisplayName ? { author: { '@type': 'Person', name: page.authorDisplayName } } : {}),
        }
      : null;

  // Language versions available for this page (original + published translations),
  // used by the header's view control to link between locales. Public info, so
  // the anonymous cached lookup is safe on the static document.
  const translationLocales = await pageService.getCachedPublishedTranslationLocales(resolved.sourcePath);

  const pageContext = {
    pageId: page.pageId,
    revisionId: page.revisionId,
    path: isTranslation ? getTranslatedPageHref(resolved.locale, resolved.sourcePath).slice(1) : resolved.sourcePath,
    title: page.title,
    status: page.status,
    canEdit,
    canPublish,
    version: page.version,
    sourcePath: resolved.sourcePath,
    translationLocales,
    currentLocale: isTranslation ? resolved.locale : null,
    linkTargetPath: page.linkTargetPath,
  };

  const bodyHtml = injectHeadingIds(page.contentHtml);
  const headings = extractHeadings(bodyHtml);
  const showShare = page.status === 'published' && !isTranslation;

  return (
    <Layout pageContext={pageContext} staticPublic>
      <div className="min-h-full flex flex-col">
        {page.status === 'draft' && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-lg py-sm text-sm">
            {t('page.read.draftBanner')}
          </div>
        )}
        <div className="grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_14rem]">
          <article
            className="page-reader-article relative mx-auto w-full min-w-0 max-w-5xl px-lg py-md"
            data-has-share={showShare || undefined}
            data-testid="page-reader-article"
          >
            {showShare && (
              <div className="absolute right-lg top-md z-10">
                <ShareButton pageId={page.pageId} title={page.title} />
              </div>
            )}
            <PageMetadata
              date={page.metadata.date}
              summary={page.metadata.summary}
              tags={[]}
              labels={{
                date: t('page.metadata.date'),
                summary: t('page.metadata.summary'),
                tags: t('page.metadata.tags'),
              }}
            />
            <ContentRenderer html={bodyHtml} />
            <footer className="mt-2xl pt-md border-t border-border text-sm text-muted">
              <div className="flex flex-wrap items-center gap-sm">
                <span>{t('page.read.createdOn', { date: formatter.dateTime(createdAt, 'short') })}
                {page.authorDisplayName ? t('page.read.authorSuffix', { name: page.authorDisplayName }) : t('page.read.authorSuffix', { name: t('common.unknownAuthor') })}</span>
                <ProvenanceIndicators pageId={page.pageId} />
              </div>
            </footer>
          </article>
          <PageSidebar
            headings={headings}
            tags={page.metadata.tags}
            tagsLabel={t('page.metadata.tags')}
            outlineLabel={t('page.read.outline') ?? 'Outline'}
          />
        </div>
        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
      </div>
    </Layout>
  );
}
