'use client';

import { useState } from 'react';
import type { AiIndexView } from '@next-wiki/shared';
import { apiDelete, apiPost, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import { TrashIcon } from '@/components/icons';
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
import { ModalDialog } from '@/components/ui/ModalDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IndexDetail } from './IndexDetail';

export function IndexList({ indexes }: { indexes: AiIndexView[] }) {
  const { t } = useTranslation();
  const [detailIndex, setDetailIndex] = useState<AiIndexView | null>(null);
  const [deleting, setDeleting] = useState<AiIndexView | null>(null);
  const [cancelling, setCancelling] = useState<AiIndexView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async (index: AiIndexView) => {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/ai/indexes/${index.id}`);
      window.location.reload();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.error.generic'));
      setBusy(false);
    }
  };
  const cancel = async (index: AiIndexView) => {
    setBusy(true);
    setError(null);
    try {
      await apiPost<void, void>(`/api/ai/indexes/${index.id}/cancel`, undefined);
      window.location.reload();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.error.generic'));
      setBusy(false);
    }
  };
  return (
    <>
    <section className="space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('admin.ai.index.title')}</h2>
          <p className="mt-xs text-sm text-muted">{t('admin.ai.index.description')}</p>
        </div>
        <Button onClick={async () => {
          const response = await fetch('/api/ai/indexes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'manual' }),
          });
          if (response.ok) window.location.reload();
        }}>{t('admin.ai.index.rebuild')}</Button>
      </div>
      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader>{t('admin.ai.index.model')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.index.dimensions')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.index.progress')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.index.failed')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.providers.status')}</DataTableHeader>
            <DataTableHeader align="right">{t('admin.users.table.actions')}</DataTableHeader>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {indexes.map((index) => (
            <DataTableRow key={index.id}>
              <DataTableCell className="font-medium">{index.modelName}</DataTableCell>
              <DataTableCell>{index.embeddingDimensions}</DataTableCell>
              <DataTableCell>{index.completedPages} / {index.totalPages}</DataTableCell>
              <DataTableCell>{index.failedPages}</DataTableCell>
              <DataTableCell>
                <div className="flex flex-wrap gap-xs">
                  <StatusBadge tone={index.status === 'ready' ? 'success' : index.status === 'failed' ? 'danger' : 'neutral'}>
                    {t(`admin.ai.indexStatus.${index.status}` as TranslationKey)}
                  </StatusBadge>
                  {index.isActive && <StatusBadge tone="info">{t('admin.ai.index.active')}</StatusBadge>}
                </div>
              </DataTableCell>
              <DataTableCell align="right">
                <div className="flex items-center justify-end gap-xs">
                  <Button variant="ghost" onClick={() => setDetailIndex(index)}>
                    {t('admin.ai.index.details')}
                  </Button>
                  {index.status === 'building' && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setCancelling(index)}
                    >
                      {t('admin.ai.index.cancel')}
                    </Button>
                  )}
                  <Tooltip label={t('admin.ai.index.delete')}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('admin.ai.index.delete')}
                      disabled={index.isActive || index.status === 'building'}
                      onClick={() => setDeleting(index)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </div>
              </DataTableCell>
            </DataTableRow>
          ))}
          {indexes.length === 0 && (
            <DataTableRow>
              <DataTableCell colSpan={6} className="py-xl text-center text-muted">
                {t('admin.ai.index.empty')}
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </section>
    {detailIndex && (
      <ModalDialog
        title={t('admin.ai.indexDetail.title')}
        onClose={() => setDetailIndex(null)}
      >
        <IndexDetail index={detailIndex} />
      </ModalDialog>
    )}
    {deleting && (
      <ConfirmDialog
        title={t('admin.ai.index.delete')}
        message={t('admin.ai.delete.confirm', { name: deleting.modelName })}
        confirmLabel={t('admin.ai.index.delete')}
        confirmVariant="danger"
        pending={busy}
        error={error ?? undefined}
        onCancel={() => {
          setDeleting(null);
          setError(null);
        }}
        onConfirm={() => void remove(deleting)}
      />
    )}
    {cancelling && (
      <ConfirmDialog
        title={t('admin.ai.index.cancel')}
        message={t('admin.ai.index.cancel.confirm', { name: cancelling.modelName })}
        confirmLabel={t('admin.ai.index.cancel')}
        confirmVariant="danger"
        pending={busy}
        error={error ?? undefined}
        onCancel={() => {
          setCancelling(null);
          setError(null);
        }}
        onConfirm={() => void cancel(cancelling)}
      />
    )}
    </>
  );
}
