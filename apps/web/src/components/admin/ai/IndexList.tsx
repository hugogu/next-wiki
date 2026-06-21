'use client';

import Link from 'next/link';
import type { AiIndexView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
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

export function IndexList({ indexes }: { indexes: AiIndexView[] }) {
  const { t } = useTranslation();
  return (
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
                <Link className="text-sm text-primary hover:underline" href={`/admin/ai/indexes/${index.id}`}>
                  {t('admin.ai.index.details')}
                </Link>
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
  );
}
