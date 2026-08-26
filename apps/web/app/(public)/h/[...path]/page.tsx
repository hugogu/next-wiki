import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { HistoryRevisionSelector } from '@/components/pages/HistoryRevisionSelector';
import {
  getPagePathFromParams,
  getHistoryHref,
  getSpaceHref,
  defaultComparePair,
  parseRevisionPair,
  type ReaderSpace,
} from '@/lib/path';
import { getStaticLocale, getDictionary } from '@/i18n/server';
import { createAppFormatter } from '@/i18n/formatter';
import { markdownBodyLineOffset } from '@/server/metadata/frontmatter';

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
  const spaceParam = typeof query.space === 'string' ? query.space : undefined;
  const space: ReaderSpace | undefined =
    spaceParam === 'generated' ? 'generated' : spaceParam === 'raw' ? 'raw' : spaceParam === 'wiki' ? 'wiki' : undefined;
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
    redirect(`${getHistoryHref(path)}${next.toString() ? `?${next}` : ''}`);
  }

  const [page, canEdit] = await Promise.all([
    pageService.getLive({ actor }, path, space),
    pageService.canCreate({ actor }),
  ]);

  if (!page) {
    notFound();
  }

  const revisions = await pageService.getHistory({ actor }, path, space);

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
        space,
      }
    : undefined;

  // Opening History without a comparison means "what changed most recently",
  // so default to the two newest visible revisions instead of an empty
  // "select two revisions" pane. The bare URL still determines the view
  // completely, so it stays shareable without a redirect.
  const effectivePair = pair ?? (selectedVersion ? null : defaultComparePair(revisions));

  const [comparedRevisions, selectedRevision] = await Promise.all([
    effectivePair
      ? Promise.all([
          pageService.getRevision({ actor }, path, effectivePair.earlier, space),
          pageService.getRevision({ actor }, path, effectivePair.later, space),
        ])
      : Promise.resolve([undefined, undefined]),
    selectedVersion
      ? pageService.getRevision({ actor }, path, selectedVersion, space)
      : Promise.resolve(undefined),
  ]);
  const visibleVersions = new Set(revisions.map((revision) => revision.version));
  // Only an explicitly requested pair 404s. A derived default that cannot be
  // fetched degrades to the neutral pane — the visitor asked for the history
  // page, not for that pair, so losing the whole page would be the wrong
  // failure.
  if (
    pair &&
    (!visibleVersions.has(pair.earlier) ||
      !visibleVersions.has(pair.later) ||
      !comparedRevisions[0] ||
      !comparedRevisions[1])
  ) {
    notFound();
  }
  const shownPair =
    effectivePair && comparedRevisions[0] && comparedRevisions[1] ? effectivePair : undefined;
  if (selectedVersion && (!visibleVersions.has(selectedVersion) || !selectedRevision)) {
    notFound();
  }

  return (
    <Layout pageContext={pageContext} space={space}>
      <div className="mx-auto max-w-7xl px-lg py-xl">
        <Link
          href={getSpaceHref(space ?? 'wiki', page?.slug ?? path)}
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
            space={space ?? 'wiki'}
            currentVersion={page?.version}
            selectedPair={shownPair ? { earlier: shownPair.earlier, later: shownPair.later } : undefined}
            selectedVersion={selectedVersion}
            earlier={
              comparedRevisions[0]
                ? {
                    ...comparedRevisions[0],
                    previewLineOffset: markdownBodyLineOffset(comparedRevisions[0].contentSource),
                  }
                : undefined
            }
            later={
              comparedRevisions[1]
                ? {
                    ...comparedRevisions[1],
                    previewLineOffset: markdownBodyLineOffset(comparedRevisions[1].contentSource),
                  }
                : undefined
            }
            selectedRevision={selectedRevision ?? undefined}
            revisions={revisions.map((revision) => ({
              version: revision.version,
              status: revision.status,
              canPublish: revision.canPublish,
              canDelete: revision.canDelete,
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
