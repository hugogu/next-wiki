import type { Metadata } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as publicContent from '@/server/services/public-content';
import { buildAnonymousCtx } from '@/server/permissions';
import { getDictionary, getLocale } from '@/i18n/server';
import { getPageHref } from '@/lib/path';
import { PageListDescription } from '@/components/pages/PageListDescription';

export const dynamic = 'force-dynamic';

const PAGE_LIMIT = 100;

type TagPageParams = Promise<{ name: string }>;

export async function generateMetadata({ params }: { params: TagPageParams }): Promise<Metadata> {
  const { name } = await params;
  return { title: decodeURIComponent(name) };
}

export default async function TagPage({ params }: { params: TagPageParams }) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const { name } = await params;
  const tagName = decodeURIComponent(name);
  const ctx = buildAnonymousCtx();
  const result = await publicContent.listPages(ctx, {
    status: 'published',
    include: [],
    'filter[tag]': [tagName],
    limit: PAGE_LIMIT,
    order: 'path',
  });
  const pages = result.items;

  return (
    <Layout>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-lg px-lg py-xl">
        <header>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            {t('pages.tag.title', { tag: tagName })}
          </h1>
        </header>

        {pages.length === 0 ? (
          <EmptyState title={t('pages.tag.empty', { tag: tagName })} />
        ) : (
          <ul className="space-y-sm">
            {pages.map((page) => {
              const publishedAt = page.publishedRevision?.publishedAt ?? null;
              return (
                <li key={page.path}>
                  <Link
                    href={getPageHref(page.path)}
                    className="block rounded-lg border border-border bg-surface p-md transition-colors hover:border-primary"
                  >
                    <span className="font-display text-xl font-medium text-foreground">{page.title}</span>
                    <PageListDescription value={page.metadata?.summary} />
                    <p className="mt-xs text-sm text-muted">
                      {publishedAt
                        ? t('home.page.publishedOn', { date: new Date(publishedAt).toLocaleDateString(locale) })
                        : t('home.page.updatedRecently')}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </Layout>
  );
}
