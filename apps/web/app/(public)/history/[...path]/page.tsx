import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { PublishButton } from '@/components/pages/PublishButton';
import { getPagePathFromParams, getPageHref, getRevisionHref } from '@/lib/path';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.history.metadataTitle', { path }) };
}

export default async function HistoryPage({ params }: { params: Params }) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const revisions = await pageService.getHistory({ actor }, path);
  const page = await pageService.getLive({ actor }, path);

  if (revisions.length === 0 && !page) {
    notFound();
  }

  const pageContext = page
    ? {
        path,
        title: page.title,
        status: page.status,
        canEdit: await pageService.canCreate({ actor }),
        canPublish: false,
        version: page.version,
      }
    : undefined;

  return (
    <Layout pageContext={pageContext}>
      <div className="max-w-3xl mx-auto px-lg py-xl">
        <Link href={getPageHref(path)} className="text-sm text-primary hover:underline mb-md inline-block">
          {t('page.history.backToPage', { title: page?.title ?? path })}
        </Link>
        <h1 className="font-display text-3xl font-semibold mb-md">{t('page.history.heading', { title: page?.title ?? path })}</h1>
        {revisions.length === 0 ? (
          <EmptyState title={t('page.history.empty.title')}>
            <p>{t('page.history.empty.forbidden')}</p>
          </EmptyState>
        ) : (
          <ul className="space-y-sm">
            {revisions.map((r) => (
              <li key={r.version} className="flex items-center justify-between p-md bg-surface border border-border rounded-lg">
                <div>
                  <Link href={getRevisionHref(path, r.version)} className="font-medium text-primary hover:underline">
                    {t('page.history.versionLink', { version: r.version })}
                  </Link>
                  <span className="ml-sm text-sm text-muted capitalize">{r.status}</span>
                  <p className="text-sm text-muted">
                    {t('page.history.revisionMeta', { date: new Date(r.createdAt).toLocaleDateString(locale), name: r.authorDisplayName ?? t('common.unknownAuthor') })}
                  </p>
                </div>
                {r.status === 'draft' && r.canPublish ? (
                  <PublishButton path={path} version={r.version} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
