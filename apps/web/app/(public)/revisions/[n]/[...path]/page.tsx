import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams, getHistoryHref } from '@/lib/path';
import { getRevisionDiffHref, parseRevisionPair } from '@/lib/path';
import { RevisionDiffView } from '@/components/pages/RevisionDiffView';
import { getStaticLocale, getDictionary } from '@/i18n/server';
import { createAppFormatter } from '@/i18n/formatter';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[]; n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.revision.metadataTitle', { version: raw.n, path }) };
}

export default async function RevisionPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const pair = parseRevisionPair(raw.n);
  if (pair) {
    const actor = await getCurrentActor();
    const query = await searchParams;
    if (pair.reversed) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => { if (typeof value === 'string') params.set(key, value); });
      redirect(`${getRevisionDiffHref(path, pair.earlier, pair.later)}${params.size ? `?${params}` : ''}`);
    }
    const [earlier, later] = await Promise.all([pageService.getRevision({ actor }, path, pair.earlier), pageService.getRevision({ actor }, path, pair.later)]);
    if (!earlier || !later) notFound();
    const canEdit = await pageService.canCreate({ actor });
    return <Layout pageContext={{ path, title: `${t('page.diff.heading')}: ${pair.earlier}..${pair.later}`, status: later.status, canEdit, canPublish: false, version: later.version }}><div className="mx-auto max-w-7xl px-lg py-xl"><Link href={getHistoryHref(path)} className="mb-md inline-block text-sm text-primary hover:underline">{t('page.revision.backToHistory')}</Link><h1 className="mb-md font-display text-3xl font-semibold">{t('page.diff.heading')}</h1><RevisionDiffView earlier={earlier} later={later} /></div></Layout>;
  }
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
          {revision.status === 'published' ? t('page.revision.publishedOn', { date: formatter.dateTime(createdAt, 'short') }) : t('page.revision.draftOn', { date: formatter.dateTime(createdAt, 'short') })}
          {revision.authorDisplayName ? t('page.revision.authorSuffix', { name: revision.authorDisplayName }) : t('page.revision.authorSuffix', { name: t('common.unknownAuthor') })}
        </p>
        <article className="bg-surface border border-border rounded-lg p-lg">
          <ContentRenderer html={revision.contentHtml} />
        </article>
      </div>
    </Layout>
  );
}
