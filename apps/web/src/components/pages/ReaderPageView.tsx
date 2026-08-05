import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { PageMetadata } from '@/components/pages/PageMetadata';
import { PageSidebar } from '@/components/pages/PageSidebar';
import { ShareButton } from '@/components/pages/ShareButton';
import { ProvenanceIndicators } from '@/components/pages/ProvenanceIndicators';
import { extractHeadings, injectHeadingIds } from '@/lib/html';
import { buildPageDescription } from '@/lib/seo';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { getReadablePublishedTranslationLocales, getCachedPublishedTranslationLocales } from '@/server/services/pages';
import type { ResolvedReaderPage } from '@/server/services/reader-routing';
import type { Actor } from '@/server/permissions';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/server';
import { createAppFormatter } from '@/i18n/formatter';
import { env } from '@/server/config';

type Props = {
  actor: Actor;
  locale: Locale;
  resolved: Exclude<ResolvedReaderPage, { kind: 'not_found' }>;
  staticPublic: boolean;
};

export async function ReaderPageView({ actor, locale, resolved, staticPublic }: Props) {
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);

  if (resolved.kind === 'forbidden') {
    const canRegister = resolved.visibility === 'registered' && actor.kind === 'anonymous';
    return (
      <Layout staticPublic={staticPublic}>
        <article className="flex-1 px-lg py-2xl max-w-none text-center">
          <h1 className="text-xl font-semibold mb-sm">{t('page.read.accessDeniedTitle')}</h1>
          <p className="text-muted mb-lg">
            {canRegister ? t('page.read.registeredAccessDenied') : t('page.read.restrictedAccessDenied')}
          </p>
          {canRegister ? (
            <div className="flex justify-center gap-sm">
              <Link className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground" href="/auth/register">
                {t('page.read.registerToView')}
              </Link>
              <Link className="rounded-md border border-border px-md py-sm text-sm font-medium hover:bg-surface-elevated" href="/auth/login">
                {t('auth.login.heading')}
              </Link>
            </div>
          ) : (
            <Link className="text-primary underline" href="/">{t('errors.forbidden.backHome')}</Link>
          )}
        </article>
      </Layout>
    );
  }

  if (resolved.kind === 'unavailable') {
    return (
      <Layout staticPublic={staticPublic}>
        <article className="flex-1 px-lg py-2xl max-w-none text-center">
          <h1 className="text-xl font-semibold mb-sm">{t('translation.reader.unavailable.title')}</h1>
          <p className="text-muted mb-lg">{t('translation.reader.unavailable.body')}</p>
          <a className="text-primary underline" href={canonicalSpacePath(resolved.space, resolved.sourcePath)}>
            {t('errors.notFound.backHome')}
          </a>
        </article>
      </Layout>
    );
  }

  const { page } = resolved;
  const isTranslation = resolved.kind === 'translation';
  const canEdit = false;
  const isAuthor = actor.kind === 'user' ? page.authorId === actor.userId : false;
  const canPublish =
    !isTranslation &&
    page.status === 'draft' &&
    (canEdit || isAuthor || (actor.kind === 'user' && actor.role === 'admin'));
  const translationLocales = staticPublic
    ? await getCachedPublishedTranslationLocales(resolved.sourcePath, resolved.space.slug)
    : await getReadablePublishedTranslationLocales({ actor }, resolved.sourcePath, resolved.space.slug);
  const createdAt = new Date(page.createdAt);
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  const canonicalPath = canonicalSpacePath(resolved.space, resolved.sourcePath, isTranslation ? resolved.locale : null);
  const jsonLd =
    staticPublic && page.status === 'published'
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
    path: resolved.sourcePath,
    title: page.title,
    status: page.status,
    canEdit,
    canPublish,
    version: page.version,
    sourcePath: resolved.sourcePath,
    translationLocales,
    currentLocale: isTranslation ? resolved.locale : null,
    space: resolved.space.kind,
    routePrefix: resolved.space.routePrefix ?? (resolved.space.kind === 'wiki' ? 'wiki' : resolved.space.kind),
    date: page.metadata.date,
    tags: page.metadata.tags.map((tag) => tag.name),
    summary: page.metadata.summary,
    visibility: page.visibility,
  };
  const bodyHtml = injectHeadingIds(page.contentHtml);
  const headings = extractHeadings(bodyHtml);
  const showShare = page.status === 'published' && !isTranslation && page.visibility === 'public';

  return (
    <Layout pageContext={pageContext} staticPublic={staticPublic} space={resolved.space.kind} routePrefix={pageContext.routePrefix}>
      <div className="min-h-full flex flex-col">
        {page.status === 'draft' && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-lg py-sm text-sm">
            {t('page.read.draftBanner')}
          </div>
        )}
        <div className="grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <article className="page-reader-article relative mx-auto w-full min-w-0 max-w-5xl px-lg py-md" data-has-share={showShare || undefined} data-testid="page-reader-article">
            {showShare && (
              <div className="absolute right-lg top-md z-10">
                <ShareButton pageId={page.pageId} title={page.title} />
              </div>
            )}
            <PageMetadata
              date={page.metadata.date}
              summary={page.metadata.summary}
              tags={[]}
              labels={{ date: t('page.metadata.date'), summary: t('page.metadata.summary'), tags: t('page.metadata.tags') }}
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
          <PageSidebar headings={headings} tags={page.metadata.tags} tagsLabel={t('page.metadata.tags')} outlineLabel={t('page.read.outline') ?? 'Outline'} />
        </div>
        {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      </div>
    </Layout>
  );
}
