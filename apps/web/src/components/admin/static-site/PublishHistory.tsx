'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  StaticSiteExclusionCounts,
  StaticSitePublicationListResponse,
  StaticSitePublicationView,
} from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

const RUNNING_STATES = ['queued', 'running'];

/** Reason keys are stable identifiers shared with the server. */
const REASON_KEYS = [
  'not_published',
  'deleted',
  'restricted',
  'space_not_anonymous',
  'space_kind_raw',
  'space_kind_generated',
] as const;

function ExclusionBreakdown({ counts }: { counts: StaticSiteExclusionCounts }) {
  const { t } = useTranslation();
  const entries = REASON_KEYS.filter((key) => (counts[key] ?? 0) > 0);
  if (entries.length === 0) return null;

  return (
    <ul className="mt-xs space-y-xs">
      {entries.map((key) => (
        <li key={key} className="text-xs text-muted">
          {t(`admin.staticSite.reason.${key}` as 'admin.staticSite.reason.deleted')}: {counts[key]}
        </li>
      ))}
    </ul>
  );
}

function statusClass(status: StaticSitePublicationView['status']): string {
  if (status === 'failed') return 'text-danger';
  if (status === 'succeeded') return 'text-success';
  return 'text-muted';
}

export function PublishHistory() {
  const { t } = useTranslation();
  const history = useQuery({
    queryKey: ['static-site-publications'],
    queryFn: () =>
      apiGet<StaticSitePublicationListResponse>('/api/static-site/publications?limit=20'),
    // Follows the same rule as the overview: poll only while something is
    // actually running.
    refetchInterval: (query) =>
      RUNNING_STATES.includes(query.state.data?.items[0]?.status ?? '') ? 2000 : false,
  });

  const items = history.data?.items ?? [];

  return (
    <section className="space-y-sm">
      <h2 className="text-sm font-medium">{t('admin.staticSite.history')}</h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.staticSite.historyEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((run) => (
            <li key={run.id} className="px-md py-sm text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-sm">
                <span className={statusClass(run.status)}>
                  {t(
                    `admin.staticSite.status.${run.status}` as 'admin.staticSite.status.succeeded',
                  )}
                </span>
                <span className="text-xs text-muted">
                  {run.completedAt
                    ? new Date(run.completedAt).toLocaleString()
                    : run.startedAt
                      ? new Date(run.startedAt).toLocaleString()
                      : ''}
                </span>
              </div>

              {run.status === 'succeeded' ? (
                <p className="mt-xs text-xs text-muted">
                  {t('admin.staticSite.counts', {
                    pages: run.pagesPublished,
                    assets: run.assetsPublished,
                    excluded: run.pagesExcluded,
                  })}
                  {run.commitSha ? ` · ${run.commitSha.slice(0, 7)}` : ''}
                </p>
              ) : null}

              {/* Error messages are stored redacted of credential material, so
                  they are safe to display verbatim. */}
              {run.errorMessage ? (
                <p className="mt-xs text-xs text-danger">{run.errorMessage}</p>
              ) : null}

              <ExclusionBreakdown counts={run.exclusionsByReason} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export { RUNNING_STATES };
