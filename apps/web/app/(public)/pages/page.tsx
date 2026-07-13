import type { Metadata } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import * as pageService from '@/server/services/pages';
import { paginate } from '@/server/api/pagination';
import { buildAnonymousCtx } from '@/server/permissions';
import { getDictionary, getStaticLocale } from '@/i18n/server';
import { getPageHref } from '@/lib/path';
import { PageListDescription } from '@/components/pages/PageListDescription';
import { createAppFormatter } from '@/i18n/formatter';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

type PagesSearchParams = Promise<{ page?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  return { title: t('pages.list.metadataTitle') };
}

export default async function PublishedPagesPage({
  searchParams,
}: {
  searchParams: PagesSearchParams;
}) {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);
  const params = await searchParams;
  const ctx = buildAnonymousCtx();
  const totalPublished = await pageService.countPublished(ctx);
  const pagination = paginate({
    page: params.page,
    pageSize: PAGE_SIZE,
    totalItems: totalPublished,
  });
  const pages = await pageService.listPublished(ctx, {
    limit: pagination.pageSize,
    offset: pagination.offset,
    order: 'path',
  });

  return (
    <Layout>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-lg px-lg py-xl">
        <header>
          <h1 className="font-display text-3xl font-semibold text-foreground">{t('pages.list.title')}</h1>
        </header>

        {pages.length === 0 ? (
          <EmptyState title={t('pages.list.empty')} />
        ) : (
          <>
            <ul className="space-y-sm">
              {pages.map((page) => (
                <li key={page.path}>
                  <Link
                    href={getPageHref(page.path)}
                    className="block rounded-lg border border-border bg-surface p-md transition-colors hover:border-primary"
                  >
                    <span className="font-display text-xl font-medium text-foreground">{page.title}</span>
                    <PageListDescription value={page.description} />
                    <p className="mt-xs text-sm text-muted">
                      {page.publishedAt
                        ? t('home.page.publishedOn', { date: formatter.dateTime(new Date(page.publishedAt), 'short') })
                        : t('home.page.updatedRecently')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination currentPage={pagination.page} totalPages={pagination.totalPages} />
          </>
        )}
      </main>
    </Layout>
  );
}
