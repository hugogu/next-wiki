'use client';

import { useCallback, useState } from 'react';
import type {
  AiActionFeature,
  AiActionStatus,
  AiActionView,
  AiModelView,
  AiProviderView,
} from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
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

const PAGE_SIZE = 20;

const FEATURE_LABELS: Record<AiActionFeature, TranslationKey> = {
  provider_test: 'admin.ai.actionFeature.provider_test',
  model_sync: 'admin.ai.actionFeature.model_sync',
  index_rebuild: 'admin.ai.actionFeature.index_rebuild',
  semantic_search: 'admin.ai.actionFeature.semantic_search',
  wiki_question: 'admin.ai.actionFeature.wiki_question',
  text_optimization: 'admin.ai.actionFeature.text_optimization',
  image_generation: 'admin.ai.actionFeature.image_generation',
};

const STATUS_LABELS: Record<AiActionStatus, TranslationKey> = {
  queued: 'admin.ai.actionStatus.queued',
  running: 'admin.ai.actionStatus.running',
  completed: 'admin.ai.actionStatus.completed',
  failed: 'admin.ai.actionStatus.failed',
  cancelled: 'admin.ai.actionStatus.cancelled',
  expired: 'admin.ai.actionStatus.expired',
};

const FEATURES = Object.keys(FEATURE_LABELS) as AiActionFeature[];
const STATUSES = Object.keys(STATUS_LABELS) as AiActionStatus[];

export function AiActionAuditTable({
  actions,
  total,
  providers,
  models,
}: {
  actions: AiActionView[];
  total: number;
  providers: AiProviderView[];
  models: AiModelView[];
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState(actions);
  const [count, setCount] = useState(total);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ feature: '', status: '', providerId: '', modelId: '' });
  const [viewing, setViewing] = useState<AiActionView | null>(null);

  const load = useCallback(
    async (targetPage: number, next: typeof filters) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (next.feature) params.set('feature', next.feature);
        if (next.status) params.set('status', next.status);
        if (next.providerId) params.set('providerId', next.providerId);
        if (next.modelId) params.set('modelId', next.modelId);
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(targetPage * PAGE_SIZE));
        const result = await apiGet<{ items: AiActionView[]; total: number }>(`/api/ai/actions?${params.toString()}`);
        setItems(result.items);
        setCount(result.total);
        setPage(targetPage);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const applyFilter = (key: keyof typeof filters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    void load(0, next);
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-md">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.actions.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.actions.description')}</p>
      </div>
      <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
        <Select value={filters.feature} onChange={(event) => applyFilter('feature', event.target.value)}>
          <option value="">{t('admin.ai.actions.filters.allFeatures')}</option>
          {FEATURES.map((value) => (
            <option key={value} value={value}>{t(FEATURE_LABELS[value])}</option>
          ))}
        </Select>
        <Select value={filters.status} onChange={(event) => applyFilter('status', event.target.value)}>
          <option value="">{t('admin.ai.actions.filters.allStatuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>
          ))}
        </Select>
        <Select value={filters.providerId} onChange={(event) => applyFilter('providerId', event.target.value)}>
          <option value="">{t('admin.ai.actions.filters.allProviders')}</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </Select>
        <Select value={filters.modelId} onChange={(event) => applyFilter('modelId', event.target.value)}>
          <option value="">{t('admin.ai.actions.filters.allModels')}</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>{model.providerName} / {model.displayName}</option>
          ))}
        </Select>
      </div>
      <DataTable>
        <DataTableHead><DataTableRow>
          <DataTableHeader>{t('admin.ai.actions.table.queued')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.actions.table.feature')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.actions.table.status')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.actions.table.user')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.actions.table.providerModel')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.actions.table.error')}</DataTableHeader>
        </DataTableRow></DataTableHead>
        <DataTableBody>
          {items.map((action) => (
            <DataTableRow key={action.id}>
              <DataTableCell>{new Date(action.queuedAt).toLocaleString()}</DataTableCell>
              <DataTableCell>{t(FEATURE_LABELS[action.feature])}</DataTableCell>
              <DataTableCell>
                <StatusBadge tone={action.status === 'completed' ? 'success' : action.status === 'failed' ? 'danger' : 'neutral'}>
                  {t(STATUS_LABELS[action.status])}
                </StatusBadge>
              </DataTableCell>
              <DataTableCell className="font-mono text-xs">{action.actorUserId ?? t('admin.ai.actions.system')}</DataTableCell>
              <DataTableCell>{[action.providerName, action.modelName].filter(Boolean).join(' / ') || '—'}</DataTableCell>
              <DataTableCell>
                {action.errorCode ? (
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => setViewing(action)}
                  >
                    {action.errorCode}
                  </button>
                ) : '—'}
              </DataTableCell>
            </DataTableRow>
          ))}
          {items.length === 0 && (
            <DataTableRow>
              <DataTableCell colSpan={6} className="py-xl text-center text-muted">
                {t('admin.ai.actions.empty')}
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" disabled={page <= 0 || loading} onClick={() => void load(page - 1, filters)}>
          <ChevronLeftIcon />
          <span className="ml-2">{t('userCenter.audit.prev')}</span>
        </Button>
        <span className="text-sm text-muted">
          {t('userCenter.audit.page')} {page + 1} {t('userCenter.audit.of')} {totalPages}
        </span>
        <Button type="button" variant="ghost" disabled={page + 1 >= totalPages || loading} onClick={() => void load(page + 1, filters)}>
          <span className="mr-2">{t('userCenter.audit.next')}</span>
          <ChevronRightIcon />
        </Button>
      </div>

      {viewing && (
        <ModalDialog
          title={t('admin.ai.actions.errorDetail')}
          description={[t(FEATURE_LABELS[viewing.feature]), viewing.errorCode].filter(Boolean).join(' · ')}
          onClose={() => setViewing(null)}
        >
          <div className="space-y-sm">
            {viewing.errorMessage && <p className="text-sm text-danger">{viewing.errorMessage}</p>}
            {Object.keys(viewing.requestMetadata).length > 0 && (
              <section className="space-y-xs">
                <h3 className="text-xs font-medium text-muted">{t('admin.ai.actions.request')}</h3>
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-surface p-sm text-xs">
                  {JSON.stringify(viewing.requestMetadata, null, 2)}
                </pre>
              </section>
            )}
            {Object.keys(viewing.resultMetadata).length > 0 && (
              <section className="space-y-xs">
                <h3 className="text-xs font-medium text-muted">{t('admin.ai.actions.response')}</h3>
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-surface p-sm text-xs">
                  {JSON.stringify(viewing.resultMetadata, null, 2)}
                </pre>
              </section>
            )}
            <section className="space-y-xs">
              <h3 className="text-xs font-medium text-muted">{t('admin.ai.actions.stack')}</h3>
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface p-sm text-xs">
                {viewing.errorDetail ?? t('admin.ai.actions.noDetail')}
              </pre>
            </section>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
