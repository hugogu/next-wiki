import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';
import { getPageHref } from '@/lib/path';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('common.brand') };
}

export default async function HomePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const pages = await pageService.listPublished(buildAnonymousCtx());

  return (
    <Layout>
      <div className="h-full flex flex-col items-center justify-center px-lg py-xl">
        <div className="max-w-2xl w-full text-center">
          <h1 className="font-display text-5xl font-semibold text-foreground mb-md">
            {t('common.brand')}
          </h1>
          <p className="text-lg text-muted mb-xl">
            {t('home.tagline')}
          </p>

          {pages.length === 0 ? (
            <EmptyState title={t('home.empty.title')}>
              <p className="text-muted">{t('home.empty.body')}</p>
            </EmptyState>
          ) : (
            <div className="text-left">
              <h2 className="font-display text-2xl font-semibold mb-md">{t('home.publishedPagesTitle')}</h2>
              <ul className="space-y-sm">
                {pages.map((page) => (
                  <li key={page.path}>
                    <a
                      href={getPageHref(page.path)}
                      className="block p-md bg-surface border border-border rounded-lg hover:border-primary transition-colors group"
                    >
                      <span className="font-display text-xl font-medium group-hover:text-primary transition-colors">{page.title}</span>
                      <p className="text-sm text-muted mt-xs">
                        {page.publishedAt
                          ? t('home.page.publishedOn', { date: new Date(page.publishedAt).toLocaleDateString(locale) })
                          : t('home.page.updatedRecently')}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
