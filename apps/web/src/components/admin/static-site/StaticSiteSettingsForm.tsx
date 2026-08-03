'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  githubPagesDefaultUrl,
  staticSiteCustomDomain,
  type StaticSiteProvider,
  type StaticSiteTargetUpsertInput,
  type StaticSiteTargetView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
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

export function StaticSiteSettingsForm({ initial }: { initial: StaticSiteTargetView | null }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [remoteUrl, setRemoteUrl] = useState(initial?.remoteUrl ?? '');
  const [branch, setBranch] = useState(initial?.branch ?? 'gh-pages');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [provider, setProvider] = useState<StaticSiteProvider>(
    initial?.provider ?? 'github_pages',
  );
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
  });
  const live = status.data ?? initial;

  const save = useApiMutation<StaticSiteTargetUpsertInput, StaticSiteTargetView>(
    '/api/static-site/target',
    { method: 'PUT' },
  );

  // The most damaging misconfiguration this feature has: a base address that
  // does not match how the host serves the site publishes successfully and
  // then resolves every link, image, and stylesheet against the wrong root.
  const expectedBaseUrl = githubPagesDefaultUrl(remoteUrl);
  const customDomain = staticSiteCustomDomain(baseUrl);
  const baseUrlMismatch =
    expectedBaseUrl !== null &&
    baseUrl.trim() !== '' &&
    customDomain === null &&
    baseUrl.replace(/\/*$/, '/') !== expectedBaseUrl;

  const onSave = () => {
    setError(null);
    setMessage(null);
    // Saving keeps the current enable state; enabling and publishing happen on
    // the overview, so this form never triggers a publish as a side effect.
    save.mutate(
      {
        isEnabled: live?.isEnabled ?? false,
        provider,
        remoteUrl,
        branch,
        baseUrl,
        autoPublishOnChange,
        scheduledPublishEnabled,
        scheduledIntervalMinutes,
      },
      {
        onSuccess: () => {
          setMessage(t('admin.staticSite.saved'));
          void status.refetch();
          router.refresh();
        },
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  return (
    <div className="space-y-md">
      {/* The two features write different artifacts to different branches for
          different audiences. Said once, quietly — the form is the focus. */}
      <p className="text-xs text-muted">{t('admin.staticSite.notGitExport')}</p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      {/* One provider today. The artifact is plain files with no
          host-proprietary constructs, so another host can be added beside this
          without touching generation. */}
      <SettingsTabs
        tabs={[{ id: 'github_pages' as const, label: t('admin.staticSite.provider.github_pages') }]}
        selected={provider}
        onSelect={setProvider}
      >
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
              placeholder={expectedBaseUrl ?? 'https://owner.github.io/repository/'}
            />
          </Field>

          {baseUrlMismatch && expectedBaseUrl ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-sm">
              <p className="text-xs text-foreground">
                {t('admin.staticSite.baseUrlMismatch', {
                  repo: remoteUrl,
                  expected: expectedBaseUrl,
                })}
              </p>
              <Button
                variant="secondary"
                className="mt-xs"
                onClick={() => setBaseUrl(expectedBaseUrl)}
              >
                {t('admin.staticSite.baseUrlUseExpected', { expected: expectedBaseUrl })}
              </Button>
            </div>
          ) : null}

          {customDomain ? (
            <p className="text-xs text-muted">{t('admin.staticSite.baseUrlCustomDomain')}</p>
          ) : null}

          {/* Credentials are not configured here: Git export and publishing reach
              the same GitHub account, so the credential is set once under
              Integrations and shared. */}
          <p className="text-xs text-muted">
            {t('admin.staticSite.credentialFromIntegration')}{' '}
            <Link href="/admin/integrations" className="text-primary underline">
              {t('admin.nav.integrations')}
            </Link>
          </p>
        </div>
      </SettingsTabs>

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

      <div className="flex items-center gap-sm">
        <Button onClick={onSave} disabled={save.isPending}>
          {t('common.actions.save')}
        </Button>
      </div>

      <p className="text-xs text-muted">{t('admin.staticSite.spaceKindNotice')}</p>
    </div>
  );
}
