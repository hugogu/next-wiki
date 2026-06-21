'use client';

import { useMemo, useState } from 'react';
import type { AiCapability, AiModelView } from '@next-wiki/shared';
import { Switch } from '@/components/ui/Switch';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

type ChatCapability = Extract<AiCapability, 'vision' | 'audio' | 'thinking'>;
const CHAT_CAPABILITIES: ChatCapability[] = ['vision', 'audio', 'thinking'];
const capabilityLabels: Record<ChatCapability, TranslationKey> = {
  vision: 'admin.ai.chatCapability.vision',
  audio: 'admin.ai.chatCapability.audio',
  thinking: 'admin.ai.chatCapability.thinking',
};

export function ModelCatalog({ models }: { models: AiModelView[] }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [providerId, setProviderId] = useState('');
  const providers = useMemo(
    () => [...new Map(models.map((model) => [model.providerId, model.providerName])).entries()],
    [models],
  );
  const filtered = models.filter((model) => {
    const matchesQuery = !query || `${model.displayName} ${model.externalId}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!providerId || model.providerId === providerId);
  });
  const toggle = async (model: AiModelView, capability: AiCapability, supported: boolean) => {
    const key = `${model.id}:${capability}`;
    setBusy(key);
    await fetch(`/api/ai/models/${model.id}/capabilities/${capability}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supported, details: { configuredFrom: 'model_catalog' } }),
    });
    window.location.reload();
  };

  return (
    <section className="space-y-md">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.models.catalogTitle')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.models.catalogDescription')}</p>
      </div>
      <div className="grid gap-sm sm:grid-cols-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.ai.models.filter')} />
        <Select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          <option value="">{t('admin.ai.models.allProviders')}</option>
          {providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </div>
      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader>{t('admin.ai.models.model')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.models.provider')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.models.type')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.models.context')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.models.chatCapabilities')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.providers.status')}</DataTableHeader>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {filtered.map((model) => {
            const type = model.providerType;
            return (
              <DataTableRow key={model.id}>
                <DataTableCell>
                  <p className="font-medium">{model.displayName}</p>
                  <p className="mt-xs max-w-xs truncate font-mono text-xs text-muted">{model.externalId}</p>
                </DataTableCell>
                <DataTableCell>{model.providerName}</DataTableCell>
                <DataTableCell>
                  <StatusBadge tone="info">
                    {t(`admin.ai.modelType.${type}` as TranslationKey)}
                  </StatusBadge>
                </DataTableCell>
                <DataTableCell>{model.contextWindow?.toLocaleString() ?? '—'}</DataTableCell>
                <DataTableCell>
                  {type === 'chat' ? (
                    <div className="flex flex-wrap gap-md">
                      {CHAT_CAPABILITIES.map((capability) => {
                        const current = model.capabilities.find((item) => item.capability === capability);
                        return (
                          <label key={capability} className="flex items-center gap-xs text-xs">
                            <Switch
                              checked={current?.supported === true}
                              disabled={busy === `${model.id}:${capability}`}
                              aria-label={`${model.displayName}: ${t(capabilityLabels[capability])}`}
                              onClick={() => void toggle(model, capability, current?.supported !== true)}
                            />
                            <span>{t(capabilityLabels[capability])}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : <span className="text-xs text-muted">—</span>}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={model.availability === 'available' ? 'success' : model.availability === 'unavailable' ? 'danger' : 'neutral'}>
                    {t(`admin.ai.modelAvailability.${model.availability}` as TranslationKey)}
                  </StatusBadge>
                </DataTableCell>
              </DataTableRow>
            );
          })}
          {filtered.length === 0 && (
            <DataTableRow>
              <DataTableCell colSpan={6} className="py-xl text-center text-muted">
                {t('admin.ai.models.empty')}
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </section>
  );
}
