'use client';

import { useMemo, useState } from 'react';
import type { AiCapability, AiModelView, AiProviderView, AiPurpose } from '@next-wiki/shared';
import { apiDelete, apiPost, apiPut, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { PlusIcon, TrashIcon } from '@/components/icons';
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

export function ModelCatalog({
  models,
  providers,
  purpose,
  activeModelId,
}: {
  models: AiModelView[];
  providers: AiProviderView[];
  purpose: AiPurpose;
  activeModelId: string | null;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [providerId, setProviderId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addProviderId, setAddProviderId] = useState(providers[0]?.id ?? '');
  const [externalId, setExternalId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [embeddingDimensions, setEmbeddingDimensions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AiModelView | null>(null);
  const catalogType = providers[0]?.type ?? models[0]?.providerType ?? 'chat';
  const providerOptions = useMemo(
    () => [...new Map(models.map((model) => [model.providerId, model.providerName])).entries()],
    [models],
  );
  const addProvider = providers.find((provider) => provider.id === addProviderId);
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
  const remove = async (model: AiModelView) => {
    setBusy(`${model.id}:delete`);
    setError(null);
    try {
      await apiDelete(`/api/ai/models/${model.id}`);
      window.location.reload();
    } catch (value) {
      setError(
        (value as ApiError).code === 'MODEL_IN_USE'
          ? t('admin.ai.error.inUse')
          : (value as ApiError).message ?? t('admin.ai.error.generic'),
      );
      setBusy(null);
    }
  };
  // Activate a model for this capability. Assignments are one-per-purpose, so
  // this implicitly deactivates whichever model was active before.
  const activate = async (model: AiModelView) => {
    setBusy(`${model.id}:activate`);
    setError(null);
    try {
      await apiPut(`/api/ai/assignments/${purpose}`, { modelId: model.id, confirmCapability: true });
      window.location.reload();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.error.generic'));
      setBusy(null);
    }
  };

  return (
    <section className="space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('admin.ai.models.catalogTitle')}</h2>
          <p className="mt-xs text-sm text-muted">
            {t(`admin.ai.models.catalogDescription.${catalogType}`)}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={providers.length === 0}
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="mr-xs h-4 w-4" />
          {t('admin.ai.models.add')}
        </Button>
      </div>
      {error && !deleting && <Alert>{error}</Alert>}
      <div className="grid gap-sm sm:grid-cols-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.ai.models.filter')} />
        <Select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          <option value="">{t('admin.ai.models.allProviders')}</option>
          {providerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </div>
      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader>{t('admin.ai.models.model')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.models.provider')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.models.type')}</DataTableHeader>
            {catalogType !== 'image' && (
              <DataTableHeader>{t('admin.ai.models.context')}</DataTableHeader>
            )}
            {catalogType === 'chat' && (
              <DataTableHeader>{t('admin.ai.models.chatCapabilities')}</DataTableHeader>
            )}
            {catalogType === 'embedding' && (
              <>
                <DataTableHeader>{t('admin.ai.models.embeddingDimensions')}</DataTableHeader>
                <DataTableHeader>{t('admin.ai.models.multilingualSupport')}</DataTableHeader>
              </>
            )}
            <DataTableHeader>{t('admin.ai.providers.status')}</DataTableHeader>
            <DataTableHeader align="right">{t('admin.ai.actions.table.actions')}</DataTableHeader>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {filtered.map((model) => {
            const type = model.providerType;
            return (
              <DataTableRow key={model.id}>
                <DataTableCell>
                  <div className="flex items-center gap-sm">
                    <p className="font-medium">{model.displayName}</p>
                    {model.id === activeModelId && (
                      <StatusBadge tone="success">{t('admin.ai.models.active')}</StatusBadge>
                    )}
                  </div>
                  <p className="mt-xs max-w-xs truncate font-mono text-xs text-muted">{model.externalId}</p>
                </DataTableCell>
                <DataTableCell>{model.providerName}</DataTableCell>
                <DataTableCell>
                  <StatusBadge tone="info">
                    {t(`admin.ai.modelType.${type}` as TranslationKey)}
                  </StatusBadge>
                </DataTableCell>
                {catalogType !== 'image' && (
                  <DataTableCell>{model.contextWindow?.toLocaleString() ?? '—'}</DataTableCell>
                )}
                {catalogType === 'chat' && (
                  <DataTableCell>
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
                  </DataTableCell>
                )}
                {catalogType === 'embedding' && (
                  <>
                    <DataTableCell>
                      {model.embeddingDimensions?.toLocaleString() ?? '—'}
                    </DataTableCell>
                    <DataTableCell>
                      {model.embeddingMultilingualSupport === null
                        ? t('admin.ai.models.supportUnknown')
                        : model.embeddingMultilingualSupport
                          ? t('admin.ai.models.supported')
                          : t('admin.ai.models.unsupported')}
                    </DataTableCell>
                  </>
                )}
                <DataTableCell>
                  <StatusBadge tone={model.availability === 'available' ? 'success' : model.availability === 'unavailable' ? 'danger' : 'neutral'}>
                    {t(`admin.ai.modelAvailability.${model.availability}` as TranslationKey)}
                  </StatusBadge>
                </DataTableCell>
                <DataTableCell align="right">
                  <div className="flex items-center justify-end gap-sm">
                    {model.id === activeModelId ? (
                      <span className="text-xs font-medium text-success">{t('admin.ai.models.active')}</span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={
                          model.availability === 'unavailable'
                          || (purpose === 'wiki_embedding' && !model.embeddingDimensions)
                          || busy === `${model.id}:activate`
                        }
                        onClick={() => void activate(model)}
                      >
                        {t('admin.ai.models.activate')}
                      </Button>
                    )}
                    <Tooltip label={t('admin.ai.models.delete')}>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('admin.ai.models.delete')}
                        disabled={busy === `${model.id}:delete`}
                        onClick={() => setDeleting(model)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </DataTableCell>
              </DataTableRow>
            );
          })}
          {filtered.length === 0 && (
            <DataTableRow>
              <DataTableCell colSpan={catalogType === 'image' ? 5 : catalogType === 'embedding' ? 8 : 7} className="py-xl text-center text-muted">
                {t('admin.ai.models.empty')}
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
      {adding && (
        <ModalDialog
          title={t('admin.ai.models.add')}
          onClose={() => setAdding(false)}
        >
          <form
            className="space-y-md"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy('add');
              setError(null);
              try {
                await apiPost(`/api/ai/providers/${addProviderId}/models`, {
                  externalId,
                  displayName,
                  ...(addProvider?.type === 'embedding'
                    ? { embeddingDimensions: Number(embeddingDimensions) }
                    : {}),
                });
                window.location.reload();
              } catch (value) {
                setError((value as ApiError).message ?? t('admin.ai.error.generic'));
                setBusy(null);
                setAdding(false);
              }
            }}
          >
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('admin.ai.models.provider')}</span>
              <Select value={addProviderId} onChange={(event) => setAddProviderId(event.target.value)}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </Select>
            </label>
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('admin.ai.models.externalId')}</span>
              <Input value={externalId} onChange={(event) => setExternalId(event.target.value)} required />
            </label>
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('admin.ai.models.displayName')}</span>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>
            {addProvider?.type === 'embedding' && (
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
            <div className="flex justify-end gap-sm">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button type="submit" disabled={busy === 'add'}>
                {busy === 'add' ? t('admin.ai.saving') : t('admin.ai.models.add')}
              </Button>
            </div>
          </form>
        </ModalDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={t('admin.ai.models.delete')}
          message={t('admin.ai.delete.confirm', { name: deleting.displayName })}
          confirmLabel={t('admin.ai.models.delete')}
          confirmVariant="danger"
          pending={busy === `${deleting.id}:delete`}
          error={error ?? undefined}
          onCancel={() => {
            setDeleting(null);
            setError(null);
          }}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </section>
  );
}
