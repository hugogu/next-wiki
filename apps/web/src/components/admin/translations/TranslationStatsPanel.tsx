'use client';

import Link from 'next/link';
import type { TranslationStats } from '@next-wiki/shared';
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

export function TranslationStatsPanel({ stats }: { stats: TranslationStats }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-sm md:grid-cols-3">
        <Summary label={t('translation.stats.sourcePages')} value={stats.totalSourcePages} />
        <Summary label={t('translation.stats.translatedPages')} value={stats.totalTranslatedPages} />
        <Summary label={t('translation.stats.languages')} value={stats.languages.filter((l) => l.totalPages > 0).length} />
      </div>

      {stats.languages.length === 0 ? (
        <p className="rounded-lg border border-border p-md text-sm text-muted">
          {t('translation.language.empty')}
        </p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>{t('translation.run.targetLocale')}</DataTableHeader>
              <DataTableHeader>{t('translation.language.enabled')}</DataTableHeader>
              <DataTableHeader>{t('translation.stats.translatedPages')}</DataTableHeader>
              <DataTableHeader>{t('translation.freshness.fresh')}</DataTableHeader>
              <DataTableHeader>{t('translation.freshness.stale')}</DataTableHeader>
              <DataTableHeader>{t('translation.stats.coverage')}</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {stats.languages.map((lang) => {
              const coverage =
                stats.totalSourcePages > 0
                  ? Math.round((lang.totalPages / stats.totalSourcePages) * 100)
                  : 0;
              return (
                <DataTableRow key={lang.code}>
                  <DataTableCell>
                    <Link
                      className="font-mono font-medium uppercase text-primary hover:underline"
                      href={`/admin/translations?tab=documents`}
                    >
                      {lang.code}
                    </Link>
                    <span className="ml-sm text-xs text-muted">{lang.name}</span>
                  </DataTableCell>
                  <DataTableCell>
                    {lang.retired ? (
                      <StatusBadge tone="neutral">{t('translation.language.retired')}</StatusBadge>
                    ) : (
                      <StatusBadge tone={lang.enabled ? 'success' : 'neutral'}>
                        {t(lang.enabled ? 'translation.language.enabled' : 'translation.status.paused')}
                      </StatusBadge>
                    )}
                  </DataTableCell>
                  <DataTableCell className="font-medium">{lang.totalPages}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge tone="success">{lang.freshPages}</StatusBadge>
                  </DataTableCell>
                  <DataTableCell>
                    {lang.stalePages > 0 ? (
                      <StatusBadge tone="warning">{lang.stalePages}</StatusBadge>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </DataTableCell>
                  <DataTableCell className="text-muted">{coverage}%</DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-md">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-xs text-2xl font-semibold">{value}</div>
    </div>
  );
}
