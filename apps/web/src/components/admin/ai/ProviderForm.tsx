'use client';

import { useMemo, useState } from 'react';
import type {
  AiProviderHealth,
  AiProviderType,
  AiProviderVendor,
  AiProviderView,
} from '@next-wiki/shared';
import { AI_PROVIDER_VENDORS, getAiProviderVendor } from '@next-wiki/shared';
import { apiPost, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const VENDOR_LABELS: Record<AiProviderVendor, TranslationKey> = {
  openai: 'admin.ai.vendor.openai',
  openrouter: 'admin.ai.vendor.openrouter',
  anthropic: 'admin.ai.vendor.anthropic',
  kimi: 'admin.ai.vendor.kimi',
  voyage: 'admin.ai.vendor.voyage',
  minimax: 'admin.ai.vendor.minimax',
  zai: 'admin.ai.vendor.zai',
  custom: 'admin.ai.vendor.custom',
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
  const vendors = useMemo(
    () => AI_PROVIDER_VENDORS.filter((item) => item.capabilities.includes(type)),
    [type],
  );
  const initialVendor = vendors[0]!.vendor;
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [vendor, setVendor] = useState<AiProviderVendor>(initialVendor);
  const [baseUrl, setBaseUrl] = useState(
    getAiProviderVendor(initialVendor).baseUrls[type] ?? '',
  );
  const [apiKey, setApiKey] = useState('');
  const [manualModelId, setManualModelId] = useState('');
  const [embeddingDimensions, setEmbeddingDimensions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const health = await apiPost<unknown, AiProviderHealth>('/api/ai/providers/test', {
        mode: 'draft',
        type,
        vendor,
        baseUrl,
        credentials: { apiKey },
      });
      setTestResult(
        health.ok
          ? { ok: true, text: t('admin.ai.providers.testOk', { latency: health.latencyMs }) }
          : {
              ok: false,
              text: t('admin.ai.providers.testFailed', {
                detail: health.errorMessage ?? health.errorCode ?? '',
              }),
            },
      );
    } catch (value) {
      setTestResult({
        ok: false,
        text: t('admin.ai.providers.testFailed', { detail: (value as ApiError).message ?? '' }),
      });
    } finally {
      setTesting(false);
    }
  };

  // Until the admin types their own label, default it to the model id (for
  // vendors entered manually) or the vendor name, so they rarely have to.
  const vendorDefinition = getAiProviderVendor(vendor);
  const manualModel =
    vendorDefinition.modelDiscovery === 'none'
    && (vendorDefinition.builtinModels?.[type]?.length ?? 0) === 0;
  const suggestedName = manualModel && manualModelId.trim() ? manualModelId.trim() : t(VENDOR_LABELS[vendor]);
  const effectiveName = nameEdited ? name : suggestedName;

  return (
    <form
      className="space-y-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
          const provider = await apiPost<unknown, AiProviderView>('/api/ai/providers', {
            name: effectiveName,
            type,
            vendor,
            baseUrl,
            config: {},
            credentials: { apiKey },
            enabled: true,
          });
          if (manualModel && manualModelId) {
            await apiPost(`/api/ai/providers/${provider.id}/models`, {
              externalId: manualModelId,
              displayName: manualModelId,
              ...(type === 'embedding'
                ? { embeddingDimensions: Number(embeddingDimensions) }
                : {}),
            });
          } else if (!manualModel) {
            // Auto-sync models when the vendor supports discovery, so the admin
            // doesn't have to manually click "Sync" after creating a provider.
            try {
              await apiPost<Record<string, never>, unknown>(
                `/api/ai/providers/${provider.id}/model-syncs`,
                {},
              );
            } catch {
              // Sync is best-effort; the provider was created successfully.
            }
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
        <Input
          value={effectiveName}
          onChange={(event) => {
            setNameEdited(true);
            setName(event.target.value);
          }}
          required
        />
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.vendor')}</span>
        <Select
          value={vendor}
          onChange={(event) => {
            const next = event.target.value as AiProviderVendor;
            setVendor(next);
            setBaseUrl(getAiProviderVendor(next).baseUrls[type] ?? '');
          }}
        >
          {vendors.map((item) => (
            <option key={item.vendor} value={item.vendor}>{t(VENDOR_LABELS[item.vendor])}</option>
          ))}
        </Select>
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.providers.baseUrl')}</span>
        <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
      </label>
      {manualModel && (
        <>
          <label className="block space-y-xs">
            <span className="text-sm font-medium">{t('admin.ai.providers.initialModel')}</span>
            <Input
              value={manualModelId}
              onChange={(event) => setManualModelId(event.target.value)}
              required
              placeholder={type === 'image' && vendor === 'minimax' ? 'image-01' : undefined}
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
      {testResult && (
        <p className={`text-sm ${testResult.ok ? 'text-success' : 'text-danger'}`}>{testResult.text}</p>
      )}
      <div className="flex items-center justify-between gap-sm pt-sm">
        <Button
          type="button"
          variant="secondary"
          disabled={testing || !baseUrl || !apiKey}
          onClick={runTest}
        >
          {testing ? t('admin.ai.providers.testing') : t('admin.ai.providers.test')}
        </Button>
        <div className="flex gap-sm">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('admin.ai.saving') : t('admin.ai.providers.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}
