'use client';

import { useState } from 'react';
import type { AiActionAccepted, AiProviderView } from '@next-wiki/shared';
import { apiPost, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { Input } from '@/components/ui/Input';
import type { TranslationKey } from '@/i18n/types';

const protocolLabels = {
  openai_compatible: 'admin.ai.providerProtocol.openaiCompatible',
  openrouter: 'admin.ai.providerProtocol.openrouter',
  anthropic: 'admin.ai.providerProtocol.anthropic',
  voyage: 'admin.ai.providerProtocol.voyage',
  minimax: 'admin.ai.providerProtocol.minimax',
} as const;

export function ProviderDetail({ provider }: { provider: AiProviderView }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const launch = async (resource: 'tests' | 'model-syncs') => {
    setBusy(true);
    setMessage(null);
    try {
      const action = await apiPost<Record<string, never>, AiActionAccepted>(`/api/ai/providers/${provider.id}/${resource}`, {});
      setMessage(`${t('admin.ai.action.queued')}: ${action.id}`);
    } catch (value) {
      setMessage((value as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-md">
      {message && <Alert>{message}</Alert>}
      <dl className="grid gap-sm rounded-lg border border-border bg-surface p-md sm:grid-cols-2">
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.kind')}</dt><dd>{t(`admin.ai.providerType.${provider.type}` as TranslationKey)}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.protocol')}</dt><dd>{t(protocolLabels[provider.kind])}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.status')}</dt><dd>{t(`admin.ai.providerStatus.${provider.status}` as TranslationKey)}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.modelDiscovery')}</dt><dd>{t(`admin.ai.modelDiscovery.${provider.modelDiscovery}` as TranslationKey)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted">{t('admin.ai.providers.baseUrl')}</dt><dd className="break-all">{provider.baseUrl}</dd></div>
      </dl>
      <form
        className="space-y-sm rounded-lg border border-border bg-surface p-md"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage(null);
          const response = await fetch(`/api/ai/providers/${provider.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name,
              baseUrl,
              ...(apiKey ? { credentials: { apiKey } } : {}),
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            setMessage(String(body.message ?? t('admin.ai.error.generic')));
            setBusy(false);
            return;
          }
          window.location.reload();
        }}
      >
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.providerDetail.update')}</h2>
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
        <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
        <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('admin.ai.providerDetail.newApiKey')} />
        <Button type="submit" disabled={busy}>{t('admin.ai.providerDetail.save')}</Button>
      </form>
      <div className="flex gap-sm">
        <Button disabled={busy || !provider.enabled} onClick={() => void launch('tests')}>{t('admin.ai.providers.test')}</Button>
        <Button variant="secondary" disabled={busy || !provider.enabled} onClick={() => void launch('model-syncs')}>{t('admin.ai.providers.sync')}</Button>
      </div>
    </div>
  );
}
