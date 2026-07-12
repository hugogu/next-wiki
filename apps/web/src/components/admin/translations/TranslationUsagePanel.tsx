'use client';

import type { TranslationUsageRow } from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { useTranslation } from '@/i18n/client';

export function TranslationUsagePanel({ rows }: { rows: TranslationUsageRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border p-md text-sm text-muted">
        {t('translation.usage.empty')}
      </p>
    );
  }
  return (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader>{t('translation.usage.key')}</DataTableHeader>
          <DataTableHeader>{t('translation.item.completed')}</DataTableHeader>
          <DataTableHeader>{t('translation.usage.reported')}</DataTableHeader>
          <DataTableHeader>{t('translation.usage.estimated')}</DataTableHeader>
          <DataTableHeader>{t('translation.usage.unavailable')}</DataTableHeader>
          <DataTableHeader>{t('translation.usage.duration')}</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => (
          <DataTableRow key={row.key}>
            <DataTableCell className="font-medium">{row.key}</DataTableCell>
            <DataTableCell>
              {row.completed} / {row.skipped} / {row.failed}
            </DataTableCell>
            <DataTableCell>
              {row.reportedInputTokens} / {row.reportedOutputTokens}
            </DataTableCell>
            <DataTableCell>
              {row.estimatedInputTokens} / {row.estimatedOutputTokens}
            </DataTableCell>
            <DataTableCell>{row.unavailableCount}</DataTableCell>
            <DataTableCell>{Math.round(row.totalDurationMs / 1000)}s</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
