'use client';

import { useMemo, useState } from 'react';
import type {
  AiModelDiscovery,
  AiProviderKind,
  AiProviderType,
  AiProviderView,
} from '@next-wiki/shared';
import { apiPost, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const PROTOCOLS: Record<AiProviderType, AiProviderKind[]> = {
  chat: ['openai_compatible', 'openrouter', 'anthropic'],
  embedding: ['openai_compatible', 'openrouter', 'voyage'],
  image: ['openai_compatible', 'openrouter', 'minimax'],
};

const DEFAULTS: Record<AiProviderKind, { baseUrl: string; discovery: AiModelDiscovery }> = {
  openai_compatible: { baseUrl: 'https://api.openai.com/v1', discovery: 'openai' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', discovery: 'openrouter' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', discovery: 'anthropic' },
  voyage: { baseUrl: 'https://api.voyageai.com/v1', discovery: 'none' },
  minimax: { baseUrl: 'https://api.minimaxi.com/v1', discovery: 'none' },
};

const PROTOCOL_LABELS: Record<AiProviderKind, TranslationKey> = {
  openai_compatible: 'admin.ai.providerProtocol.openaiCompatible',
  openrouter: 'admin.ai.providerProtocol.openrouter',
  anthropic: 'admin.ai.providerProtocol.anthropic',
  voyage: 'admin.ai.providerProtocol.voyage',
  minimax: 'admin.ai.providerProtocol.minimax',
};

export function ProviderForm({
  type,
  onCancel,
  onCreated,
}: {
  type: AiProviderType;
  onCancel: () => void;
  onCreated: (provider: AiProviderView) => void;
}) {
  const { t } = useTranslation();
  const protocols = useMemo(() => PROTOCOLS[type], [type]);
  const initialProtocol = protocols[0]!;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AiProviderKind>(initialProtocol);
  const [baseUrl, setBaseUrl] = useState(DEFAULTS[initialProtocol].baseUrl);
  const [modelDiscovery, setModelDiscovery] = useState<AiModelDiscovery>(
    DEFAULTS[initialProtocol].discovery,
  );
  const [apiKey, setApiKey] = useState('');
  const [manualModelId, setManualModelId] = useState('');
  const [embeddingDimensions, setEmbeddingDimensions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
          const provider = await apiPost<unknown, AiProviderView>('/api/ai/providers', {
            name,
            type,
            kind,
            modelDiscovery,
            baseUrl,
            config: {},
            credentials: { apiKey },
            enabled: true,
          });
          if (modelDiscovery === 'none' && manualModelId) {
            await apiPost(`/api/ai/providers/${provider.id}/models`, {
              externalId: manualModelId,
              displayName: manualModelId,
              ...(type === 'embedding'
                ? { embeddingDimensions: Number(embeddingDimensions) }
                : {}),
            });
          }
          onCreated(provider);
        } catch (value) {
          setError((value as ApiError).message ?? t('admin.ai.error.generic'));
          setSaving(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.name')}</span>
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.protocol')}</span>
        <Select
          value={kind}
          onChange={(event) => {
            const next = event.target.value as AiProviderKind;
            setKind(next);
            setBaseUrl(DEFAULTS[next].baseUrl);
            setModelDiscovery(DEFAULTS[next].discovery);
          }}
        >
          {protocols.map((protocol) => (
            <option key={protocol} value={protocol}>{t(PROTOCOL_LABELS[protocol])}</option>
          ))}
        </Select>
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.baseUrl')}</span>
        <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.modelDiscovery')}</span>
        <Select
          value={modelDiscovery}
          onChange={(event) => setModelDiscovery(event.target.value as AiModelDiscovery)}
        >
          <option value="openai">{t('admin.ai.modelDiscovery.openai')}</option>
          <option value="openrouter">{t('admin.ai.modelDiscovery.openrouter')}</option>
          <option value="anthropic">{t('admin.ai.modelDiscovery.anthropic')}</option>
          <option value="none">{t('admin.ai.modelDiscovery.none')}</option>
        </Select>
      </label>
      {modelDiscovery === 'none' && (
        <>
          <label className="block space-y-xs">
            <span className="text-sm font-medium">{t('admin.ai.providers.initialModel')}</span>
            <Input
              value={manualModelId}
              onChange={(event) => setManualModelId(event.target.value)}
              required
              placeholder={type === 'image' && kind === 'minimax' ? 'image-01' : undefined}
            />
          </label>
          {type === 'embedding' && (
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('admin.ai.function.embeddingDimensions')}</span>
              <Input
                type="number"
                min={1}
                value={embeddingDimensions}
                onChange={(event) => setEmbeddingDimensions(event.target.value)}
                required
              />
            </label>
          )}
        </>
      )}
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.apiKey')}</span>
        <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required />
      </label>
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? t('admin.ai.saving') : t('admin.ai.providers.create')}
        </Button>
      </div>
    </form>
  );
}
