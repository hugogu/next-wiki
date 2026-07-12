'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TranslationRunView } from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';
import { TranslationRunControls, runStatusTone } from './TranslationRunControls';

const TERMINAL: TranslationRunView['status'][] = [
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
];

export function TranslationRunList({ runs }: { runs: TranslationRunView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  // Keep progress live while any run is still in flight.
  const hasActive = runs.some((run) => !TERMINAL.includes(run.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => router.refresh(), 2_000);
    return () => clearInterval(timer);
  }, [hasActive, router]);

  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-border p-md text-sm text-muted">
        {t('translation.run.empty')}
      </p>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader>{t('translation.run.targetLocale')}</DataTableHeader>
          <DataTableHeader>{t('translation.run.model')}</DataTableHeader>
          <DataTableHeader>{t('admin.transfers.table.status')}</DataTableHeader>
          <DataTableHeader>{t('admin.transfers.table.progress')}</DataTableHeader>
          <DataTableHeader>{t('admin.transfers.table.started')}</DataTableHeader>
          <DataTableHeader>{t('admin.transfers.table.actions')}</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {runs.map((run) => (
          <DataTableRow key={run.id}>
            <DataTableCell>
              <Link
                className="font-mono font-medium uppercase text-primary hover:underline"
                href={`/admin/translations/${run.id}`}
              >
                {run.targetLocale}
              </Link>
            </DataTableCell>
            <DataTableCell className="text-muted">{run.modelName ?? '—'}</DataTableCell>
            <DataTableCell>
              <StatusBadge tone={runStatusTone(run.status)}>
                {t(`translation.status.${run.status}`)}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell>
              {t('translation.run.progress', { processed: run.processedItems, total: run.totalItems })}
            </DataTableCell>
            <DataTableCell>{new Date(run.queuedAt).toLocaleString()}</DataTableCell>
            <DataTableCell>
              <TranslationRunControls run={run} />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
