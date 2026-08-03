'use client';

import Link from 'next/link';
import type {
  StaticSiteEligibilitySummary as EligibilitySummaryView,
  StaticSiteExclusionCounts,
  StaticSitePublicationView,
} from '@next-wiki/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

const REASON_KEYS = [
  'not_published',
  'deleted',
  'restricted',
  'space_not_anonymous',
  'space_kind_raw',
  'space_kind_generated',
] as const;

type EligibilitySummaryProps = {
  run?: StaticSitePublicationView | null;
};

function ReasonBreakdown({ counts }: { counts: StaticSiteExclusionCounts }) {
  const { t } = useTranslation();
  const entries = REASON_KEYS.filter((key) => (counts[key] ?? 0) > 0);

  if (entries.length === 0) {
    return (
      <p className="mt-xs text-xs text-muted">{t('admin.staticSite.eligibility.noExclusions')}</p>
    );
  }

  return (
    <ul className="mt-xs space-y-xs">
      {entries.map((key) => (
        <li key={key} className="flex justify-between gap-md text-xs text-muted">
          <span>{t(`admin.staticSite.reason.${key}` as 'admin.staticSite.reason.deleted')}</span>
          <span>{counts[key]}</span>
        </li>
      ))}
    </ul>
  );
}

function SpaceKindNotice({
  reason,
  href,
  label,
}: {
  reason: 'raw' | 'generated';
  href: string;
  label: string;
}) {
  const { t } = useTranslation();
  const message =
    reason === 'raw'
      ? t('admin.staticSite.eligibility.withholdingRaw')
      : t('admin.staticSite.eligibility.withholdingGenerated');

  return (
    <p className="mt-sm text-xs text-muted">
      {message}{' '}
      <Link href={href} className="text-primary hover:underline">
        {label}
      </Link>
    </p>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-md py-sm">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-xs text-xs text-muted">{label}</div>
    </div>
  );
}

export function EligibilitySummary({ run = null }: EligibilitySummaryProps) {
  const { t } = useTranslation();
  const eligibility = useQuery({
    queryKey: ['static-site-eligibility'],
    queryFn: () => apiGet<EligibilitySummaryView>('/api/static-site/eligibility'),
  });
  const summary = eligibility.data;
  const runCounts = run?.exclusionsByReason ?? {};
  const rawWithheld =
    (summary?.exclusionsByReason.space_kind_raw ?? 0) > 0 || (runCounts.space_kind_raw ?? 0) > 0;
  const generatedWithheld =
    (summary?.exclusionsByReason.space_kind_generated ?? 0) > 0 ||
    (runCounts.space_kind_generated ?? 0) > 0;

  return (
    <section className="space-y-sm" aria-labelledby="static-site-eligibility-title">
      <h2 id="static-site-eligibility-title" className="text-sm font-medium">
        {t('admin.staticSite.eligibility.title')}
      </h2>
      {eligibility.isLoading ? (
        <p className="text-sm text-muted">{t('admin.staticSite.eligibility.loading')}</p>
      ) : eligibility.isError || !summary ? (
        <p className="text-sm text-danger">{t('admin.staticSite.eligibility.error')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-sm">
            <CountCard
              label={t('admin.staticSite.eligibility.publishable')}
              value={summary.publishable}
            />
            <CountCard
              label={t('admin.staticSite.eligibility.excluded')}
              value={summary.excluded}
            />
          </div>
          <div className="rounded-md border border-border px-md py-sm">
            <h3 className="text-xs font-medium">{t('admin.staticSite.excludedByReason')}</h3>
            <ReasonBreakdown counts={summary.exclusionsByReason} />
          </div>
        </>
      )}
      {rawWithheld ? (
        <SpaceKindNotice
          reason="raw"
          href="/spaces/raw"
          label={t('admin.staticSite.eligibility.openRaw')}
        />
      ) : null}
      {generatedWithheld ? (
        <SpaceKindNotice
          reason="generated"
          href="/spaces/generated"
          label={t('admin.staticSite.eligibility.openGenerated')}
        />
      ) : null}
      {run ? (
        <div className="rounded-md border border-border px-md py-sm">
          <h3 className="text-xs font-medium">{t('admin.staticSite.eligibility.runExclusions')}</h3>
          <ReasonBreakdown counts={runCounts} />
        </div>
      ) : null}
    </section>
  );
}
