'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type {
  GitAuthMode,
  GitBackendConfig,
  GitExportRunResult,
  GitExportUpsert,
  GitSshKeyResult,
  StorageBackendView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { apiGet, useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-xs block text-muted">{label}</span>
      {children}
    </label>
  );
}

// Mirrors the ControlRow in StorageBackendTabs: rows stack inside one bordered
// container, separated by a top divider (suppressed on the first row).
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

export function GitExportPanel({ initial }: { initial: StorageBackendView | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const config = initial?.config as Record<string, string | number | boolean | undefined> | undefined;
  const [remoteUrl, setRemoteUrl] = useState((config?.remoteUrl as string) ?? '');
  const [branch, setBranch] = useState((config?.branch as string) ?? 'main');
  const [assetsDir, setAssetsDir] = useState((config?.assetsDir as string) ?? 'assets');
  const [username, setUsername] = useState((config?.username as string) ?? '');
  const [authMode, setAuthMode] = useState<GitAuthMode>(
    config?.authMode === 'ssh' ? 'ssh' : 'https_token',
  );
  const [secret, setSecret] = useState('');
  const [publicKey, setPublicKey] = useState((config?.publicKey as string) ?? '');
  const [fingerprint, setFingerprint] = useState((config?.fingerprint as string) ?? '');
  const [autoSyncOnPublish, setAutoSyncOnPublish] = useState(
    config?.autoSyncOnPublish !== false,
  );
  const [scheduledSyncEnabled, setScheduledSyncEnabled] = useState(
    config?.scheduledSyncEnabled === true,
  );
  const [scheduledSyncIntervalMinutes, setScheduledSyncIntervalMinutes] = useState(
    typeof config?.scheduledSyncIntervalMinutes === 'number'
      ? config.scheduledSyncIntervalMinutes
      : 60,
  );
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation<GitExportUpsert, StorageBackendView>(
    '/api/storage/git-export',
    { method: 'PUT' },
  );
  const generateKey = useApiMutation<void, GitSshKeyResult>(
    '/api/storage/git-export/ssh-key',
  );
  const run = useApiMutation<void, GitExportRunResult>('/api/storage/git-export/run');
  const reset = useApiMutation<void, StorageBackendView>('/api/storage/git-export/reset');

  // Poll while a sync is in flight so the panel reflects completion without a manual reload.
  const status = useQuery({
    queryKey: ['git-export-status'],
    queryFn: () => apiGet<StorageBackendView | null>('/api/storage/git-export'),
    initialData: initial,
    refetchInterval: (query) =>
      ['backfilling', 'degraded'].includes(query.state.data?.replicaState ?? '') ? 1500 : false,
  });
  const live = status.data ?? initial;

  const enabled = live?.isActive ?? false;
  const state = live?.replicaState ?? 'disabled';
  const hasHttpsSecret = live?.hasSecret === true && config?.authMode === 'https_token';
  const pending = save.isPending || generateKey.isPending || run.isPending || reset.isPending;

  const body = (
    nextEnabled: boolean,
    override?: Partial<GitBackendConfig>,
  ): GitExportUpsert => ({
    enabled: nextEnabled,
    config: {
      remoteUrl,
      branch,
      assetsDir,
      username: authMode === 'https_token' ? username || undefined : undefined,
      authMode,
      publicKey: authMode === 'ssh' ? publicKey || undefined : undefined,
      fingerprint: authMode === 'ssh' ? fingerprint || undefined : undefined,
      autoSyncOnPublish,
      scheduledSyncEnabled,
      scheduledSyncIntervalMinutes,
      ...override,
    },
    secret: authMode === 'https_token' ? secret || undefined : undefined,
  });

  const afterChange = () => {
    void status.refetch();
    router.refresh();
  };

  const persist = (nextEnabled: boolean, override?: Partial<GitBackendConfig>) => {
    setError(null);
    setMessage(null);
    save.mutate(body(nextEnabled, override), {
      onSuccess: () => {
        setSecret('');
        setConfirmEnable(false);
        setMessage(
          nextEnabled
            ? t('admin.storage.git.exportQueued')
            : t('admin.storage.git.saved'),
        );
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  // Mirror the enable/preferred toggles: persist immediately when the backend is
  // already configured; otherwise just stage the value for the next Save.
  const onToggleAutoSync = () => {
    const next = !autoSyncOnPublish;
    setAutoSyncOnPublish(next);
    if (enabled) persist(true, { autoSyncOnPublish: next });
  };

  const onGenerateKey = () => {
    setError(null);
    setMessage(null);
    generateKey.mutate(undefined, {
      onSuccess: (result) => {
        setAuthMode('ssh');
        setPublicKey(result.publicKey);
        setFingerprint(result.fingerprint);
        setMessage(t('admin.storage.git.keyGenerated'));
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  const onRun = () => {
    setError(null);
    setMessage(null);
    run.mutate(undefined, {
      onSuccess: (result) => {
        if (result.queued) {
          setMessage(t('admin.storage.git.exportQueued'));
          afterChange();
        } else {
          setError(t('admin.storage.git.exportNotQueued'));
        }
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  const onReset = () => {
    setError(null);
    setMessage(null);
    reset.mutate(undefined, {
      onSuccess: () => {
        setMessage(t('admin.storage.git.syncCancelled'));
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  return (
    <div className="grid gap-md">
      {/* Status group: state plus the enable and auto-sync toggles. */}
      <section className="rounded-lg border border-border bg-surface-elevated p-md">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.storage.type.git')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.storage.git.description')}</p>
          </div>
          <span
            className={`rounded-full px-sm py-xs text-xs font-medium ${
              enabled ? 'bg-success/10 text-success' : 'bg-surface text-muted'
            }`}
          >
            {t(`admin.storage.replica.state.${enabled ? state : 'disabled'}`)}
          </span>
        </div>

        <div className="mt-md rounded-md border border-border px-sm">
          <ControlRow
            label={t('admin.storage.git.enabled')}
            description={t('admin.storage.git.enabledDescription')}
          >
            <Switch
              checked={enabled}
              disabled={pending}
              aria-label={t('admin.storage.git.enabled')}
              onClick={() => (enabled ? persist(false) : setConfirmEnable(true))}
            />
          </ControlRow>

          <ControlRow
            label={t('admin.storage.git.autoSync')}
            description={t('admin.storage.git.autoSyncDescription')}
          >
            <Switch
              checked={autoSyncOnPublish}
              disabled={pending}
              aria-label={t('admin.storage.git.autoSync')}
              onClick={onToggleAutoSync}
            />
          </ControlRow>
        </div>
        {!autoSyncOnPublish && (
          <p className="mt-sm text-xs text-warning">{t('admin.storage.git.autoSyncWarning')}</p>
        )}

        {enabled && state === 'backfilling' && (
          <div className="mt-sm flex flex-wrap items-center justify-between gap-sm rounded-md border border-warning/30 bg-warning/5 px-sm py-sm">
            <p className="text-xs text-muted">
              {live?.syncStartedAt
                ? t('admin.storage.git.syncInProgressSince', {
                    time: new Date(live.syncStartedAt).toLocaleString(),
                  })
                : t('admin.storage.git.syncInProgress')}
            </p>
            <Button variant="secondary" onClick={onReset} disabled={pending}>
              {reset.isPending
                ? t('admin.storage.git.cancellingSync')
                : t('admin.storage.git.cancelSync')}
            </Button>
          </div>
        )}

        {live?.lastSyncAt && (
          <p className="mt-sm text-xs text-muted">
            {t('admin.storage.replica.lastSync', {
              time: new Date(live.lastSyncAt).toLocaleString(),
            })}
          </p>
        )}
        {live?.lastError && <p className="mt-sm text-sm text-danger">{live.lastError}</p>}
      </section>

      {/* Configuration group: remote, credentials, and scheduled sync. */}
      <section className="rounded-lg border border-border bg-surface-elevated p-md">
        <h3 className="font-display text-base font-semibold">
          {t('admin.storage.git.configHeading')}
        </h3>

        <div className="mt-md grid gap-sm">
          <Field label={t('admin.storage.git.remoteUrl')}>
            <Input
              value={remoteUrl}
              onChange={(event) => setRemoteUrl(event.target.value)}
              placeholder="git@github.com:owner/repository.git"
            />
          </Field>
          <div className="grid gap-sm sm:grid-cols-2">
            <Field label={t('admin.storage.git.branch')}>
              <Input value={branch} onChange={(event) => setBranch(event.target.value)} />
            </Field>
            <Field label={t('admin.storage.git.assetsDir')}>
              <Input value={assetsDir} onChange={(event) => setAssetsDir(event.target.value)} />
            </Field>
          </div>
          <Field label={t('admin.storage.git.authMode')}>
            <Select
              value={authMode}
              onChange={(event) => {
                setAuthMode(event.target.value as GitAuthMode);
                setError(null);
              }}
            >
              <option value="https_token">{t('admin.storage.git.authHttps')}</option>
              <option value="ssh">{t('admin.storage.git.authSsh')}</option>
            </Select>
          </Field>

          {authMode === 'https_token' ? (
            <>
              <Field label={t('admin.storage.git.username')}>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="x-access-token"
                />
              </Field>
              <Field label={t('admin.storage.git.token')}>
                <Input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={
                    hasHttpsSecret
                      ? t('admin.storage.git.tokenConfigured')
                      : t('admin.storage.git.tokenPlaceholder')
                  }
                />
              </Field>
            </>
          ) : (
            <div className="rounded-md border border-border bg-surface p-sm">
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div>
                  <p className="text-sm font-medium">{t('admin.storage.git.sshPublicKey')}</p>
                  {fingerprint && <p className="mt-xs text-xs text-muted">{fingerprint}</p>}
                </div>
                <Button variant="secondary" onClick={onGenerateKey} disabled={pending}>
                  {publicKey
                    ? t('admin.storage.git.rotateKey')
                    : t('admin.storage.git.generateKey')}
                </Button>
              </div>
              {publicKey ? (
                <>
                  <textarea
                    readOnly
                    aria-label={t('admin.storage.git.sshPublicKey')}
                    className="mt-sm min-h-24 w-full rounded-md border border-border bg-surface-elevated p-sm font-mono text-xs"
                    value={publicKey}
                  />
                  <p className="mt-xs text-xs text-muted">
                    {t('admin.storage.git.sshInstructions')}
                  </p>
                </>
              ) : (
                <p className="mt-sm text-xs text-muted">{t('admin.storage.git.sshMissing')}</p>
              )}
            </div>
          )}

          {/* Scheduled sync (safety-net trigger). */}
          <div className="rounded-md border border-border px-sm">
            <ControlRow
              label={t('admin.storage.git.scheduledSync')}
              description={t('admin.storage.git.scheduledSyncDescription')}
            >
              <Switch
                checked={scheduledSyncEnabled}
                aria-label={t('admin.storage.git.scheduledSync')}
                onClick={() => setScheduledSyncEnabled((value) => !value)}
              />
            </ControlRow>
          </div>
          {scheduledSyncEnabled && (
            <Field label={t('admin.storage.git.scheduledSyncInterval')}>
              <Input
                type="number"
                min={5}
                max={1440}
                value={scheduledSyncIntervalMinutes}
                onChange={(event) =>
                  setScheduledSyncIntervalMinutes(Number(event.target.value) || 5)
                }
              />
            </Field>
          )}
        </div>

        <div className="mt-md flex flex-wrap gap-sm">
          <Button variant="secondary" onClick={() => persist(enabled)} disabled={pending}>
            {save.isPending
              ? t('admin.storage.actions.saving')
              : t('admin.storage.actions.save')}
          </Button>
          <Button onClick={onRun} disabled={pending || !enabled}>
            {t('admin.storage.git.exportNow')}
          </Button>
        </div>

        {message && <p className="mt-sm text-sm text-success">{message}</p>}
        {error && <p className="mt-sm text-sm text-danger">{error}</p>}
      </section>

      {confirmEnable && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-lg shadow-lg">
            <h3 className="font-display text-xl font-semibold">
              {t('admin.storage.git.enableTitle')}
            </h3>
            <p className="mt-sm text-sm text-muted">{t('admin.storage.git.enableMessage')}</p>
            <div className="mt-lg flex justify-end gap-sm">
              <Button variant="ghost" onClick={() => setConfirmEnable(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button onClick={() => persist(true)} disabled={pending}>
                {t('admin.storage.git.enableAndExport')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
