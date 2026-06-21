'use client';

import { useMemo, useState } from 'react';
import type { AiActionFeature, AiActionStatus, AiActionView } from '@next-wiki/shared';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
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

export function AiActionAuditTable({ actions }: { actions: AiActionView[] }) {
  const { t } = useTranslation();
  const [feature, setFeature] = useState('');
  const [status, setStatus] = useState('');
  const [user, setUser] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = useMemo(
    () => actions.filter((action) => {
      const queued = new Date(action.queuedAt).getTime();
      return (!feature || action.feature === feature)
        && (!status || action.status === status)
        && (!user || action.actorUserId?.includes(user))
        && (!provider || action.providerName?.toLowerCase().includes(provider.toLowerCase()))
        && (!model || action.modelName?.toLowerCase().includes(model.toLowerCase()))
        && (!from || queued >= new Date(from).getTime())
        && (!to || queued <= new Date(`${to}T23:59:59.999`).getTime());
    }),
    [actions, feature, from, model, provider, status, to, user],
  );
  return (
    <div className="space-y-md">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.actions.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.actions.description')}</p>
      </div>
      <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
        <Select value={feature} onChange={(event) => setFeature(event.target.value)}>
          <option value="">{t('admin.ai.actions.filters.allFeatures')}</option>
          {[...new Set(actions.map((action) => action.feature))].map((value) => (
            <option key={value} value={value}>{t(FEATURE_LABELS[value])}</option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('admin.ai.actions.filters.allStatuses')}</option>
          {[...new Set(actions.map((action) => action.status))].map((value) => (
            <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>
          ))}
        </Select>
        <Input value={user} onChange={(event) => setUser(event.target.value)} placeholder={t('admin.ai.actions.filters.user')} />
        <Input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder={t('admin.ai.actions.filters.provider')} />
        <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder={t('admin.ai.actions.filters.model')} />
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label={t('admin.ai.actions.filters.from')} />
        <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label={t('admin.ai.actions.filters.to')} />
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
          {filtered.map((action) => <DataTableRow key={action.id}>
            <DataTableCell>{new Date(action.queuedAt).toLocaleString()}</DataTableCell>
            <DataTableCell>{t(FEATURE_LABELS[action.feature])}</DataTableCell>
            <DataTableCell>
              <StatusBadge tone={action.status === 'completed' ? 'success' : action.status === 'failed' ? 'danger' : 'neutral'}>
                {t(STATUS_LABELS[action.status])}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell className="font-mono text-xs">{action.actorUserId ?? t('admin.ai.actions.system')}</DataTableCell>
            <DataTableCell>{[action.providerName, action.modelName].filter(Boolean).join(' / ') || '—'}</DataTableCell>
            <DataTableCell>{action.errorCode ?? '—'}</DataTableCell>
          </DataTableRow>)}
          {filtered.length === 0 && (
            <DataTableRow>
              <DataTableCell colSpan={6} className="py-xl text-center text-muted">
                {t('admin.ai.actions.empty')}
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
