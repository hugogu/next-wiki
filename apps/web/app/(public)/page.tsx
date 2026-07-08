import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import * as setupService from '@/server/services/setup';
import { buildAnonymousCtx } from '@/server/permissions';
import { getPageHref, getPagesHref } from '@/lib/path';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

// Title intentionally omitted: the landing page inherits the configured site
// name from the root layout's metadata (default title).

export default async function HomePage() {
  // First-run onboarding: if no admin exists yet, guide the visitor to the
  // guided `/setup` route so the initial admin can be created. This makes a
  // fresh deployment usable with no extra steps.
  if (await setupService.isSetupNeeded()) {
    redirect('/setup');
  }

  const locale = await getLocale();
  const t = getDictionary(locale);
  const ctx = buildAnonymousCtx();
  const [pages, totalPublished] = await Promise.all([
    pageService.listPublished(ctx, { limit: 10, order: 'recent' }),
    pageService.countPublished(ctx),
  ]);

  return (
    <Layout>
      <div className="min-h-full flex flex-col items-center justify-center px-lg py-xl">
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
              <div className="mb-md flex items-center justify-between gap-md">
                <h2 className="font-display text-2xl font-semibold">{t('home.recentPagesTitle')}</h2>
                {totalPublished > pages.length && (
                  <a href={getPagesHref()} className="text-sm font-medium text-primary hover:underline">
                    {t('home.viewAllPages')}
                  </a>
                )}
              </div>
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
