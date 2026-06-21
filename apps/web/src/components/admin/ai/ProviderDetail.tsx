'use client';

import { useState } from 'react';
import type { AiProviderVendor, AiProviderView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { Input } from '@/components/ui/Input';
import type { TranslationKey } from '@/i18n/types';

const vendorLabels: Record<AiProviderVendor, TranslationKey> = {
  openai: 'admin.ai.vendor.openai',
  openrouter: 'admin.ai.vendor.openrouter',
  anthropic: 'admin.ai.vendor.anthropic',
  kimi: 'admin.ai.vendor.kimi',
  voyage: 'admin.ai.vendor.voyage',
  minimax: 'admin.ai.vendor.minimax',
  custom: 'admin.ai.vendor.custom',
} as const;

export function ProviderDetail({
  provider,
  onUpdated,
}: {
  provider: AiProviderView;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [apiKey, setApiKey] = useState('');
  return (
    <div className="space-y-md">
      {message && <Alert>{message}</Alert>}
      <dl className="grid gap-sm rounded-lg border border-border bg-surface p-md sm:grid-cols-2">
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.kind')}</dt><dd>{t(`admin.ai.providerType.${provider.type}` as TranslationKey)}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.vendor')}</dt><dd>{t(vendorLabels[provider.vendor])}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.providers.status')}</dt><dd>{t(`admin.ai.providerStatus.${provider.status}` as TranslationKey)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted">{t('admin.ai.providers.baseUrl')}</dt><dd className="break-all">{provider.baseUrl}</dd></div>
      </dl>
      <form
        className="space-y-sm"
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
          onUpdated();
        }}
      >
        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.ai.providers.name')}</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.ai.providers.baseUrl')}</span>
          <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
        </label>
        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.ai.providerDetail.newApiKey')}</span>
          <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('admin.ai.providerDetail.newApiKey')} />
        </label>
        <div className="flex justify-end pt-sm">
          <Button type="submit" disabled={busy}>{t('admin.ai.providerDetail.save')}</Button>
        </div>
      </form>
    </div>
  );
}
