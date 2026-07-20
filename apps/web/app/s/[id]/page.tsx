import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { PageMetadata } from '@/components/pages/PageMetadata';
import { ShareButton } from '@/components/pages/ShareButton';
import { TagList } from '@/components/pages/TagList';
import * as pageService from '@/server/services/pages';
import { getPageHref } from '@/lib/path';
import { getDictionary, getLocale } from '@/i18n/server';
import { getSiteName } from '@/server/services/site-settings';
import { buildPageDescription } from '@/lib/seo';
import { env } from '@/server/config';

export const dynamic = 'force-dynamic';

type ShareParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: ShareParams }): Promise<Metadata> {
  const { id } = await params;
  const page = await pageService.getPublishedForShare(id);
  if (!page) {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }
  const t = getDictionary(await getLocale());
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  const description = buildPageDescription(page.contentHtml, t('site.description'));
  return {
    title: page.title,
    description,
    // Canonical points at the primary page so the share link never competes
    // with it for indexing; the share route itself stays noindex.
    alternates: { canonical: `${siteUrl}${getPageHref(page.path)}` },
    robots: { index: false, follow: true },
  };
}

export default async function SharePage({ params }: { params: ShareParams }) {
  const { id } = await params;
  const [page, locale, siteName] = await Promise.all([
    pageService.getPublishedForShare(id),
    getLocale(),
    getSiteName(),
  ]);

  if (!page) {
    notFound();
  }

  const t = getDictionary(locale);
  const createdAt = new Date(page.createdAt);

  // Deliberately standalone — no AppShell/Navigator. The site's system theme
  // CSS is injected by the root layout, so this minimal view already follows
  // the configured appearance while showing only content and share actions.
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-lg py-md">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight text-foreground">
          {siteName}
        </Link>
        <ShareButton pageId={page.pageId} title={page.title} />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-lg py-xl">
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
        {page.metadata.tags.length > 0 && (
          <div className="mb-lg">
            <TagList tags={page.metadata.tags} ariaLabel={t('page.metadata.tags')} />
          </div>
        )}
        <ContentRenderer html={page.contentHtml} />
        <footer className="mt-2xl border-t border-border pt-md text-sm text-muted">
          {t('page.read.createdOn', { date: createdAt.toLocaleDateString(locale) })}
          {page.authorDisplayName
            ? t('page.read.authorSuffix', { name: page.authorDisplayName })
            : t('page.read.authorSuffix', { name: t('common.unknownAuthor') })}
        </footer>
      </main>
    </div>
  );
}
