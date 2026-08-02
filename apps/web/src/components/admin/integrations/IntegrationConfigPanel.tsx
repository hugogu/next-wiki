'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type {
  IntegrationAuthMode,
  IntegrationKind,
  IntegrationSshKeyResult,
  IntegrationUpsertInput,
  IntegrationView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
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

export function IntegrationConfigPanel({
  kind,
  initial,
}: {
  kind: IntegrationKind;
  initial: IntegrationView | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const [authMode, setAuthMode] = useState<IntegrationAuthMode>(initial?.authMode ?? 'ssh');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['integration', kind],
    queryFn: () => apiGet<IntegrationView | null>(`/api/integrations/${kind}`),
    initialData: initial,
  });
  const live = status.data ?? initial;

  const save = useApiMutation<IntegrationUpsertInput, IntegrationView>('/api/integrations', {
    method: 'PUT',
  });
  const generateKey = useApiMutation<void, IntegrationSshKeyResult>(
    `/api/integrations/${kind}/ssh-key`,
  );

  const pending = save.isPending || generateKey.isPending;

  const afterChange = () => {
    void status.refetch();
    router.refresh();
  };

  const onSave = () => {
    setError(null);
    setMessage(null);
    save.mutate(
      {
        kind,
        authMode,
        username: username || undefined,
        secret: secret || undefined,
      },
      {
        onSuccess: () => {
          setSecret('');
          setMessage(t('admin.integrations.saved'));
          afterChange();
        },
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  const onGenerateKey = () => {
    setError(null);
    setMessage(null);
    generateKey.mutate(undefined, {
      onSuccess: () => {
        setMessage(t('admin.integrations.keyGenerated'));
        afterChange();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  return (
    <div className="space-y-md">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      <SettingsTabs
        tabs={[
          { id: 'ssh' as const, label: t('admin.integrations.authSsh') },
          { id: 'https_token' as const, label: t('admin.integrations.authHttps') },
        ]}
        selected={authMode}
        onSelect={setAuthMode}
      >
        <div className="space-y-sm rounded-md border border-border p-md">
          {authMode === 'ssh' ? (
            <>
              <div className="flex items-center gap-sm">
                <Button variant="secondary" onClick={onGenerateKey} disabled={pending}>
                  {live?.publicKey
                    ? t('admin.integrations.regenerateKey')
                    : t('admin.integrations.generateKey')}
                </Button>
              </div>
              {live?.publicKey ? (
                <div className="space-y-xs">
                  <p className="text-xs text-muted">{t('admin.integrations.deployKeyHint')}</p>
                  <code className="block break-all rounded-md border border-border bg-surface p-sm text-xs">
                    {live.publicKey}
                  </code>
                  {live.fingerprint ? (
                    <p className="text-xs text-muted">
                      {t('admin.integrations.fingerprint')}: {live.fingerprint}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Field label={t('admin.integrations.username')}>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field
                label={t('admin.integrations.token')}
                hint={live?.hasSecret ? t('admin.integrations.secretStored') : undefined}
              >
                <Input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </Field>
            </>
          )}

          <div className="flex items-center gap-sm border-t border-border pt-sm">
            <Button onClick={onSave} disabled={pending}>
              {t('common.actions.save')}
            </Button>
          </div>
        </div>
      </SettingsTabs>
    </div>
  );
}
