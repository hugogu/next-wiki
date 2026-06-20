'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  GitAuthMode,
  GitExportRunResult,
  GitExportUpsert,
  GitSshKeyResult,
  StorageBackendView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-xs block text-muted">{label}</span>
      {children}
    </label>
  );
}

export function GitExportPanel({ initial }: { initial: StorageBackendView | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const config = initial?.config as Record<string, string | undefined> | undefined;
  const [remoteUrl, setRemoteUrl] = useState(config?.remoteUrl ?? '');
  const [branch, setBranch] = useState(config?.branch ?? 'next-wiki');
  const [assetsDir, setAssetsDir] = useState(config?.assetsDir ?? 'assets');
  const [username, setUsername] = useState(config?.username ?? '');
  const [authMode, setAuthMode] = useState<GitAuthMode>(
    config?.authMode === 'ssh' ? 'ssh' : 'https_token',
  );
  const [secret, setSecret] = useState('');
  const [publicKey, setPublicKey] = useState(config?.publicKey ?? '');
  const [fingerprint, setFingerprint] = useState(config?.fingerprint ?? '');
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
  const enabled = initial?.isActive ?? false;
  const state = initial?.replicaState ?? 'disabled';
  const hasHttpsSecret =
    initial?.hasSecret === true && config?.authMode === 'https_token';
  const pending = save.isPending || generateKey.isPending || run.isPending;

  const body = (nextEnabled: boolean): GitExportUpsert => ({
    enabled: nextEnabled,
    config: {
      remoteUrl,
      branch,
      assetsDir,
      username: authMode === 'https_token' ? username || undefined : undefined,
      authMode,
      publicKey: authMode === 'ssh' ? publicKey || undefined : undefined,
      fingerprint: authMode === 'ssh' ? fingerprint || undefined : undefined,
    },
    secret: authMode === 'https_token' ? secret || undefined : undefined,
  });

  const persist = (nextEnabled: boolean) => {
    setError(null);
    setMessage(null);
    save.mutate(body(nextEnabled), {
      onSuccess: () => {
        setSecret('');
        setConfirmEnable(false);
        setMessage(
          nextEnabled
            ? t('admin.storage.git.exportQueued')
            : t('admin.storage.git.saved'),
        );
        router.refresh();
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
        setMessage(t('admin.storage.git.keyGenerated'));
        router.refresh();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  const onRun = () => {
    setError(null);
    setMessage(null);
    run.mutate(undefined, {
      onSuccess: () => {
        setMessage(t('admin.storage.git.exportQueued'));
        router.refresh();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  return (
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
          {t(
            `admin.storage.replica.state.${enabled ? state : 'disabled'}`,
          )}
        </span>
      </div>

      <div className="mt-md flex items-center justify-between gap-md rounded-md border border-border px-sm py-sm">
        <div>
          <p className="text-sm font-medium">{t('admin.storage.git.enabled')}</p>
          <p className="mt-xs text-xs text-muted">{t('admin.storage.git.enabledDescription')}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={pending}
          aria-label={t('admin.storage.git.enabled')}
          onClick={() => (enabled ? persist(false) : setConfirmEnable(true))}
        />
      </div>

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
          <select
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={authMode}
            onChange={(event) => {
              setAuthMode(event.target.value as GitAuthMode);
              setError(null);
            }}
          >
            <option value="https_token">{t('admin.storage.git.authHttps')}</option>
            <option value="ssh">{t('admin.storage.git.authSsh')}</option>
          </select>
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

      {initial?.lastSyncAt && (
        <p className="mt-sm text-xs text-muted">
          {t('admin.storage.replica.lastSync', {
            time: new Date(initial.lastSyncAt).toLocaleString(),
          })}
        </p>
      )}
      {initial?.lastError && <p className="mt-sm text-sm text-danger">{initial.lastError}</p>}
      {message && <p className="mt-sm text-sm text-success">{message}</p>}
      {error && <p className="mt-sm text-sm text-danger">{error}</p>}

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
    </section>
  );
}
