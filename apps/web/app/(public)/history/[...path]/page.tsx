import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { HistoryRevisionSelector } from '@/components/pages/HistoryRevisionSelector';
import { getPagePathFromParams, getPageHref, getHistoryHref, getSpaceHref, parseRevisionPair } from '@/lib/path';
import { getStaticLocale, getDictionary } from '@/i18n/server';
import { createAppFormatter } from '@/i18n/formatter';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.history.metadataTitle', { path }) };
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const query = await searchParams;
  const compareValue = typeof query.compare === 'string' ? query.compare : '';
  const pair = parseRevisionPair(compareValue);
  const selectedValue = typeof query.selected === 'string' ? query.selected : '';
  const selectedVersion =
    !pair && /^\d+$/.test(selectedValue) && Number.isSafeInteger(Number(selectedValue))
      ? Number(selectedValue)
      : undefined;
  if (pair?.reversed) {
    const next = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'string') next.set(key, value);
    });
    next.set('compare', `${pair.earlier}..${pair.later}`);
    redirect(`${getHistoryHref(path)}?${next}`);
  }

  const [page, canEdit] = await Promise.all([
    pageService.getLive({ actor }, path),
    pageService.canCreate({ actor }),
  ]);

  if (!page) {
    notFound();
  }

  if (page.linkTargetPath) {
    redirect(getSpaceHref('generated', page.linkTargetPath));
  }

  const revisions = await pageService.getHistory({ actor }, path);

  if (revisions.length === 0) {
    notFound();
  }

  const pageContext = page
    ? {
        pageId: page.pageId,
        path,
        title: page.title,
        status: page.status,
        canEdit,
        canPublish: false,
        version: page.version,
      }
    : undefined;

  const [comparedRevisions, selectedRevision] = await Promise.all([
    pair
      ? Promise.all([
          pageService.getRevision({ actor }, path, pair.earlier),
          pageService.getRevision({ actor }, path, pair.later),
        ])
      : Promise.resolve([undefined, undefined]),
    selectedVersion
      ? pageService.getRevision({ actor }, path, selectedVersion)
      : Promise.resolve(undefined),
  ]);
  const visibleVersions = new Set(revisions.map((revision) => revision.version));
  if (
    pair &&
    (!visibleVersions.has(pair.earlier) ||
      !visibleVersions.has(pair.later) ||
      !comparedRevisions[0] ||
      !comparedRevisions[1])
  ) {
    notFound();
  }
  if (selectedVersion && (!visibleVersions.has(selectedVersion) || !selectedRevision)) {
    notFound();
  }

  return (
    <Layout pageContext={pageContext}>
      <div className="mx-auto max-w-7xl px-lg py-xl">
        <Link
          href={getPageHref(path)}
          className="text-sm text-primary hover:underline mb-md inline-block"
        >
          {t('page.history.backToPage', { title: page?.title ?? path })}
        </Link>
        <h1 className="font-display text-3xl font-semibold mb-md">
          {t('page.history.heading', { title: page?.title ?? path })}
        </h1>
        {revisions.length === 0 ? (
          <EmptyState title={t('page.history.empty.title')}>
            <p>{t('page.history.empty.forbidden')}</p>
          </EmptyState>
        ) : (
          <HistoryRevisionSelector
            path={path}
            pageId={page?.pageId}
            selectedPair={pair ? { earlier: pair.earlier, later: pair.later } : undefined}
            selectedVersion={selectedVersion}
            earlier={comparedRevisions[0] ?? undefined}
            later={comparedRevisions[1] ?? undefined}
            selectedRevision={selectedRevision ?? undefined}
            revisions={revisions.map((revision) => ({
              version: revision.version,
              status: revision.status,
              canPublish: revision.canPublish,
              meta: t('page.history.revisionMeta', {
                date: formatter.dateTime(new Date(revision.createdAt), 'short'),
                name: revision.authorDisplayName ?? t('common.unknownAuthor'),
              }),
            }))}
          />
        )}
      </div>
    </Layout>
  );
}
