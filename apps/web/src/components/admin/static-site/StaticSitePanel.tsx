'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type {
  StaticSitePublicationView,
  StaticSiteSshKeyResult,
  StaticSiteTargetUpsertInput,
  StaticSiteTargetView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { apiGet, useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-xs block text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-xs block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function ControlRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-md border-t border-border py-sm first:border-t-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-xs text-xs text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

const RUNNING_STATES = ['queued', 'running'];

export function StaticSitePanel({ initial }: { initial: StaticSiteTargetView | null }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [remoteUrl, setRemoteUrl] = useState(initial?.remoteUrl ?? '');
  const [branch, setBranch] = useState(initial?.branch ?? 'gh-pages');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [authMode, setAuthMode] = useState<'https_token' | 'ssh'>(
    initial?.authMode ?? 'https_token',
  );
  const [username, setUsername] = useState(initial?.username ?? '');
  const [secret, setSecret] = useState('');
  const [publicKey, setPublicKey] = useState(initial?.publicKey ?? '');
  const [fingerprint, setFingerprint] = useState(initial?.fingerprint ?? '');
  const [autoPublishOnChange, setAutoPublish] = useState(initial?.autoPublishOnChange ?? false);
  const [scheduledPublishEnabled, setScheduled] = useState(
    initial?.scheduledPublishEnabled ?? false,
  );
  const [scheduledIntervalMinutes, setInterval] = useState(
    initial?.scheduledIntervalMinutes ?? 60,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['static-site-target'],
    queryFn: () => apiGet<StaticSiteTargetView | null>('/api/static-site/target'),
    initialData: initial,
    // Poll only while a run is in flight, so an idle admin page is not a
    // background load generator.
    refetchInterval: (query) =>
      RUNNING_STATES.includes(query.state.data?.lastPublication?.status ?? '') ? 2000 : false,
  });
  const live = status.data ?? initial;
  const lastRun: StaticSitePublicationView | null = live?.lastPublication ?? null;

  const save = useApiMutation<StaticSiteTargetUpsertInput, StaticSiteTargetView>(
    '/api/static-site/target',
    { method: 'PUT' },
  );
  const publish = useApiMutation<void, StaticSitePublicationView>('/api/static-site/publications');
  const generateKey = useApiMutation<void, StaticSiteSshKeyResult>(
    '/api/static-site/target/ssh-key',
  );

  const pending = save.isPending || publish.isPending || generateKey.isPending;
  const enabled = live?.isEnabled ?? false;
  const running = RUNNING_STATES.includes(lastRun?.status ?? '');

  const body = (nextEnabled: boolean): StaticSiteTargetUpsertInput => ({
    isEnabled: nextEnabled,
    remoteUrl,
    branch,
    baseUrl,
    authMode,
    username: authMode === 'https_token' ? username || undefined : undefined,
    secret: secret || undefined,
    autoPublishOnChange,
    scheduledPublishEnabled,
    scheduledIntervalMinutes,
  });

  const afterChange = () => {
    void status.refetch();
    router.refresh();
  };

  const persist = (nextEnabled: boolean) => {
    setError(null);
    setMessage(null);
    save.mutate(body(nextEnabled), {
      onSuccess: () => {
        setSecret('');
        setMessage(
          nextEnabled ? t('admin.staticSite.publishQueued') : t('admin.staticSite.saved'),
        );
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
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

  const onGenerateKey = () => {
    setError(null);
    setMessage(null);
    generateKey.mutate(undefined, {
      onSuccess: (result) => {
        setAuthMode('ssh');
        setPublicKey(result.publicKey);
        setFingerprint(result.fingerprint);
        setMessage(t('admin.staticSite.keyGenerated'));
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  return (
    <div className="space-y-md">
      {/* The two features write different artifacts to different branches for
          different audiences. Saying so here is cheaper than an operator
          discovering it by publishing raw Markdown to a public site. */}
      <p className="rounded-md border border-border bg-surface p-md text-sm text-muted">
        {t('admin.staticSite.notGitExport')}
      </p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      <div className="space-y-sm rounded-md border border-border p-md">
        <Field label={t('admin.staticSite.remoteUrl')} hint={t('admin.staticSite.remoteUrlHint')}>
          <Input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder="https://github.com/owner/repository.git"
          />
        </Field>
        <Field label={t('admin.staticSite.branch')} hint={t('admin.staticSite.branchHint')}>
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="gh-pages" />
        </Field>
        <Field label={t('admin.staticSite.baseUrl')} hint={t('admin.staticSite.baseUrlHint')}>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://owner.github.io/repository/"
          />
        </Field>

        <Field label={t('admin.staticSite.authMode')}>
          <Select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as 'https_token' | 'ssh')}
          >
            <option value="https_token">{t('admin.staticSite.authHttps')}</option>
            <option value="ssh">{t('admin.staticSite.authSsh')}</option>
          </Select>
        </Field>

        {authMode === 'https_token' ? (
          <>
            <Field label={t('admin.staticSite.username')}>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field
              label={t('admin.staticSite.token')}
              hint={live?.hasSecret ? t('admin.staticSite.tokenStored') : undefined}
            >
              <Input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={live?.hasSecret ? '••••••••' : ''}
              />
            </Field>
          </>
        ) : (
          <div className="space-y-sm">
            <Button variant="secondary" onClick={onGenerateKey} disabled={pending}>
              {t('admin.staticSite.generateKey')}
            </Button>
            {publicKey ? (
              <div className="space-y-xs">
                <p className="text-xs text-muted">{t('admin.staticSite.deployKeyHint')}</p>
                <textarea
                  readOnly
                  value={publicKey}
                  className="w-full rounded-md border border-border bg-surface p-sm font-mono text-xs"
                  rows={3}
                />
                {fingerprint ? (
                  <p className="text-xs text-muted">
                    {t('admin.staticSite.fingerprint')}: {fingerprint}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border px-md">
        <ControlRow
          label={t('admin.staticSite.autoPublish')}
          description={t('admin.staticSite.autoPublishHint')}
        >
          <Switch checked={autoPublishOnChange} onChange={() => setAutoPublish((v) => !v)} />
        </ControlRow>
        <ControlRow
          label={t('admin.staticSite.scheduled')}
          description={t('admin.staticSite.scheduledHint')}
        >
          <div className="flex items-center gap-sm">
            {scheduledPublishEnabled ? (
              <Input
                type="number"
                min={5}
                max={1440}
                value={scheduledIntervalMinutes}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="w-24"
              />
            ) : null}
            <Switch checked={scheduledPublishEnabled} onChange={() => setScheduled((v) => !v)} />
          </div>
        </ControlRow>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <Button onClick={() => persist(enabled)} disabled={pending}>
          {t('common.actions.save')}
        </Button>
        {enabled ? (
          <>
            <Button variant="secondary" onClick={onPublish} disabled={pending || running}>
              {t('admin.staticSite.publishNow')}
            </Button>
            <Button variant="secondary" onClick={() => persist(false)} disabled={pending}>
              {t('admin.staticSite.disable')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => persist(true)} disabled={pending}>
            {t('admin.staticSite.enable')}
          </Button>
        )}
        {live?.baseUrl && lastRun?.status === 'succeeded' ? (
          <a
            href={live.baseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline"
          >
            {t('admin.staticSite.viewSite')}
          </a>
        ) : null}
      </div>

      {lastRun ? (
        <div className="space-y-xs rounded-md border border-border p-md text-sm">
          <p className="font-medium">{t('admin.staticSite.lastRun')}</p>
          <p className="text-muted">
            {t(`admin.staticSite.status.${lastRun.status}`)}
            {lastRun.completedAt ? ` · ${new Date(lastRun.completedAt).toLocaleString()}` : ''}
          </p>
          {lastRun.status === 'succeeded' ? (
            <p className="text-muted">
              {t('admin.staticSite.counts', {
                pages: lastRun.pagesPublished,
                assets: lastRun.assetsPublished,
                excluded: lastRun.pagesExcluded,
              })}
            </p>
          ) : null}
          {lastRun.errorMessage ? (
            <p className="text-danger">{lastRun.errorMessage}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
