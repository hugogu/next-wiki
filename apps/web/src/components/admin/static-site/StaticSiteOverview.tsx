'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type {
  StaticSitePublicationView,
  StaticSiteTargetUpsertInput,
  StaticSiteTargetView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { apiGet, useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { TakedownDialog } from './TakedownDialog';
import { EligibilitySummary } from './EligibilitySummary';
import { RUNNING_STATES } from './PublishHistory';

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-md border-t border-border py-sm first:border-t-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

export function StaticSiteOverview({ initial, canManage = true }: { initial: StaticSiteTargetView | null; canManage?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['static-site-target'],
    queryFn: () => apiGet<StaticSiteTargetView | null>('/api/static-site/target'),
    initialData: initial,
    // Poll only while a run is in flight, so an idle admin page is not a
    // background load generator.
    enabled: canManage,
    refetchInterval: (query) =>
      RUNNING_STATES.includes(query.state.data?.lastPublication?.status ?? '') ? 2000 : false,
  });
  const live = status.data ?? initial;

  const configure = useApiMutation<StaticSiteTargetUpsertInput, StaticSiteTargetView>(
    '/api/static-site/target',
    { method: 'PUT' },
  );
  const publish = useApiMutation<void, StaticSitePublicationView>('/api/static-site/publications');
  const takedown = useApiMutation<{ confirm: string }, StaticSitePublicationView>(
    '/api/static-site/site',
    { method: 'DELETE' },
  );

  const pending = configure.isPending || publish.isPending || takedown.isPending;
  const enabled = live?.isEnabled ?? false;
  const lastRun: StaticSitePublicationView | null = live?.lastPublication ?? null;
  const running = RUNNING_STATES.includes(lastRun?.status ?? '');

  const afterChange = () => {
    void status.refetch();
    router.refresh();
  };

  if (!live) {
    return (
      <EmptyState title={t('admin.staticSite.notConfiguredTitle')}>
        <p className="text-sm">{t('admin.staticSite.notConfiguredBody')}</p>
        {canManage && <p className="mt-sm text-sm">
          <Link href="/admin/static-site/settings" className="text-primary hover:underline">
            {t('admin.staticSite.openSettings')}
          </Link>
        </p>}
      </EmptyState>
    );
  }

  const setEnabled = (nextEnabled: boolean) => {
    setError(null);
    setMessage(null);
    configure.mutate(
      {
        isEnabled: nextEnabled,
        provider: live.provider,
        remoteUrl: live.remoteUrl,
        branch: live.branch,
        baseUrl: live.baseUrl,
        autoPublishOnChange: live.autoPublishOnChange,
        scheduledPublishEnabled: live.scheduledPublishEnabled,
        scheduledIntervalMinutes: live.scheduledIntervalMinutes,
      },
      {
        onSuccess: () => {
          setMessage(
            nextEnabled ? t('admin.staticSite.publishQueued') : t('admin.staticSite.saved'),
          );
          afterChange();
        },
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  const onPublish = () => {
    setError(null);
    setMessage(null);
    publish.mutate(undefined, {
      onSuccess: () => {
        setMessage(t('admin.staticSite.publishQueued'));
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  const onTakedown = (confirm: string) => {
    setError(null);
    setMessage(null);
    takedown.mutate(
      { confirm },
      {
        onSuccess: () => {
          setMessage(t('admin.staticSite.takedownQueued'));
          afterChange();
        },
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  return (
    <div className="space-y-md">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      <section className="space-y-sm">
        <div className="flex items-center gap-sm">
          <h2 className="text-sm font-medium">{t('admin.staticSite.configuration')}</h2>
          <StatusBadge tone={enabled ? 'success' : 'neutral'}>
            {enabled ? t('admin.staticSite.state.enabled') : t('admin.staticSite.state.disabled')}
          </StatusBadge>
        </div>
        <ul className="rounded-md border border-border px-md">
          <SummaryRow
            label={t('admin.staticSite.provider.github_pages')}
            value={
              canManage ? <Link
                href="/admin/integrations/github"
                className="text-primary hover:underline"
              >
                {live.integrationId
                  ? t('admin.integrations.statusConfigured')
                  : t('admin.integrations.statusNotConfigured')}
              </Link> : (
                live.integrationId
                  ? t('admin.integrations.statusConfigured')
                  : t('admin.integrations.statusNotConfigured')
              )
            }
          />
        </ul>
        {canManage && <p className="text-xs text-muted">
          <Link href="/admin/static-site/settings" className="text-primary hover:underline">
            {t('admin.staticSite.openSettings')}
          </Link>
        </p>}
      </section>

      <EligibilitySummary run={lastRun} />

      {lastRun ? (
        <section className="space-y-sm">
          <h2 className="text-sm font-medium">{t('admin.staticSite.lastRun')}</h2>
          <div className="rounded-md border border-border px-md py-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-sm">
              <span
                className={
                  lastRun.status === 'failed'
                    ? 'text-danger'
                    : lastRun.status === 'succeeded'
                      ? 'text-success'
                      : 'text-muted'
                }
              >
                {t(
                  `admin.staticSite.status.${lastRun.status}` as 'admin.staticSite.status.succeeded',
                )}
              </span>
              <span className="text-xs text-muted">
                {lastRun.completedAt
                  ? new Date(lastRun.completedAt).toLocaleString()
                  : lastRun.startedAt
                    ? new Date(lastRun.startedAt).toLocaleString()
                    : ''}
              </span>
            </div>
            {lastRun.status === 'succeeded' ? (
              <p className="mt-xs text-xs text-muted">
                {t('admin.staticSite.counts', {
                  pages: lastRun.pagesPublished,
                  assets: lastRun.assetsPublished,
                  excluded: lastRun.pagesExcluded,
                })}
                {lastRun.commitSha ? ` · ${lastRun.commitSha.slice(0, 7)}` : ''}
              </p>
            ) : null}
            {lastRun.errorMessage ? (
              <p className="mt-xs text-xs text-danger">{lastRun.errorMessage}</p>
            ) : null}
          </div>
          {canManage && <p className="text-xs text-muted">
            <Link href="/admin/static-site/history" className="text-primary hover:underline">
              {t('admin.staticSite.tabs.history')}
            </Link>
          </p>}
        </section>
      ) : null}

      {canManage && <div className="flex flex-wrap items-center gap-sm">
        {enabled ? (
          <>
            <Button onClick={onPublish} disabled={pending || running}>
              {t('admin.staticSite.publishNow')}
            </Button>
            <Button variant="secondary" onClick={() => setEnabled(false)} disabled={pending}>
              {t('admin.staticSite.disable')}
            </Button>
          </>
        ) : (
          <Button onClick={() => setEnabled(true)} disabled={pending}>
            {t('admin.staticSite.enable')}
          </Button>
        )}
        <TakedownDialog branch={live.branch} pending={pending} onConfirm={onTakedown} />
        {live.baseUrl && lastRun?.status === 'succeeded' ? (
          <a
            href={live.baseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline"
          >
            {t('admin.staticSite.viewSite')}
          </a>
        ) : null}
      </div>}
    </div>
  );
}
