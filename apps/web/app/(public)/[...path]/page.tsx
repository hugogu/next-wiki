import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { PageMetadata } from '@/components/pages/PageMetadata';
import { ShareButton } from '@/components/pages/ShareButton';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { buildAnonymousCtx } from '@/server/permissions';
import { getPageHref, getPagePathFromParams } from '@/lib/path';
import { buildPageDescription } from '@/lib/seo';
import { getDictionary, getLocale } from '@/i18n/server';
import { env } from '@/server/config';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const [raw, locale] = await Promise.all([params, getLocale()]);
  const path = getPagePathFromParams(raw);
  const t = getDictionary(locale);
  // Use an anonymous context so crawlers see the same metadata logged-out
  // visitors would. Private spaces simply get a noindex fallback below.
  const ctx = buildAnonymousCtx();
  const page = await pageService.getLive(ctx, path);
  const siteUrl = env.APP_URL.replace(/\/$/, '');

  if (!page) {
    return {
      title: path,
      robots: { index: false, follow: true },
    };
  }

  // Draft pages must never be indexed — only the canonical published URL
  // should show up in search results.
  if (page.status !== 'published') {
    return {
      title: page.title,
      robots: { index: false, follow: true },
    };
  }

  const canonicalPath = getPageHref(path);
  const description = buildPageDescription(page.contentHtml, t('site.description'));

  return {
    title: page.title,
    description,
    alternates: { canonical: `${siteUrl}${canonicalPath}` },
    openGraph: {
      type: 'article',
      url: `${siteUrl}${canonicalPath}`,
      title: page.title,
      description,
      siteName: t('common.brand'),
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      ...(page.publishedAt ? { publishedTime: page.publishedAt } : {}),
      ...(page.authorDisplayName ? { authors: [page.authorDisplayName] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PageRead({ params }: { params: PageParams }) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const page = await pageService.getLive({ actor }, path);

  if (!page) {
    notFound();
  }

  const canEdit = await pageService.canCreate({ actor });
  const isAuthor = actor.kind === 'user' ? page.authorId === actor.userId : false;
  const canPublish = page.status === 'draft' && (canEdit || isAuthor || (actor.kind === 'user' && actor.role === 'admin'));

  const createdAt = new Date(page.createdAt);

  // Article structured data for search engines. Only published pages get
  // indexed; draft pages emit no JSON-LD so search engines can’t surface
  // pre-publication content via the schema endpoint either.
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  const canonicalPath = getPageHref(path);
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

  const pageContext = {
    pageId: page.pageId,
    revisionId: page.revisionId,
    path,
    title: page.title,
    status: page.status,
    canEdit,
    canPublish,
    version: page.version,
  };

  return (
    <Layout pageContext={pageContext}>
      <div className="min-h-full flex flex-col">
        {page.status === 'draft' && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-lg py-sm text-sm">
            {t('page.read.draftBanner')}
          </div>
        )}
        <article className="flex-1 px-lg py-md max-w-none">
          {page.status === 'published' && (
            <div className="flex justify-end">
              <ShareButton pageId={page.pageId} title={page.title} />
            </div>
          )}
          <PageMetadata
            {...page.metadata}
            labels={{
              date: t('page.metadata.date'),
              summary: t('page.metadata.summary'),
              tags: t('page.metadata.tags'),
            }}
          />
          <ContentRenderer html={page.contentHtml} />
          <footer className="mt-2xl pt-md border-t border-border text-sm text-muted">
            {t('page.read.createdOn', { date: createdAt.toLocaleDateString(locale) })}
            {page.authorDisplayName ? t('page.read.authorSuffix', { name: page.authorDisplayName }) : t('page.read.authorSuffix', { name: t('common.unknownAuthor') })}
          </footer>
        </article>
        {jsonLd && (
          <script
            type="application/ld+json"
            // The payload is built from server-side data only, so it is safe
            // to inject as a literal JSON string.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
      </div>
    </Layout>
  );
}
