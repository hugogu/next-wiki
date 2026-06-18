import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams, getHistoryHref } from '@/lib/path';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[]; n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.revision.metadataTitle', { version: raw.n, path }) };
}

export default async function RevisionPage({ params }: { params: Params }) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const version = parseInt(raw.n, 10);
  if (Number.isNaN(version) || version < 1) {
    notFound();
  }

  const actor = await getCurrentActor();
  const revision = await pageService.getRevision({ actor }, path, version);

  if (!revision) {
    notFound();
  }

  const canEdit = await pageService.canCreate({ actor });
  const createdAt = new Date(revision.createdAt);

  return (
    <Layout pageContext={{ path, title: t('page.revision.heading', { version }), status: revision.status, canEdit, canPublish: false, version }}>
      <div className="max-w-3xl mx-auto px-lg py-xl">
        <div className="flex items-center justify-between mb-md">
          <h1 className="font-display text-3xl font-semibold">{t('page.revision.heading', { version })}</h1>
          <Link
            href={getHistoryHref(path)}
            className="text-sm text-primary hover:underline"
          >
            {t('page.revision.backToHistory')}
          </Link>
        </div>
        <p className="text-sm text-muted mb-xl">
          {revision.status === 'published' ? t('page.revision.publishedOn', { date: createdAt.toLocaleDateString(locale) }) : t('page.revision.draftOn', { date: createdAt.toLocaleDateString(locale) })}
          {revision.authorDisplayName ? t('page.revision.authorSuffix', { name: revision.authorDisplayName }) : t('page.revision.authorSuffix', { name: t('common.unknownAuthor') })}
        </p>
        <article className="bg-surface border border-border rounded-lg p-lg">
          <ContentRenderer html={revision.contentHtml} />
        </article>
      </div>
    </Layout>
  );
}
