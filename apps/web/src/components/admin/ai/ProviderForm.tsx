'use client';

import { useState } from 'react';
import type { AiProviderView } from '@next-wiki/shared';
import { apiPost, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';

export function ProviderForm() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [kind, setKind] = useState<'openrouter' | 'openai_compatible'>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-sm rounded-lg border border-border bg-surface p-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await apiPost<unknown, AiProviderView>('/api/ai/providers', {
            name,
            kind,
            baseUrl,
            config: {},
            credentials: { apiKey },
            enabled: true,
          });
          window.location.reload();
        } catch (value) {
          setError((value as ApiError).message ?? t('admin.ai.error.generic'));
          setSaving(false);
        }
      }}
    >
      <h2 className="font-display text-lg font-semibold">{t('admin.ai.providers.add')}</h2>
      {error && <Alert>{error}</Alert>}
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('admin.ai.providers.name')} required />
      <select className="w-full rounded-md border border-border bg-background px-md py-sm" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
        <option value="openrouter">OpenRouter</option>
        <option value="openai_compatible">OpenAI compatible</option>
      </select>
      <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={t('admin.ai.providers.baseUrl')} required />
      <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('admin.ai.providers.apiKey')} required />
      <Button type="submit" disabled={saving}>{saving ? t('admin.ai.saving') : t('admin.ai.providers.create')}</Button>
    </form>
  );
}
