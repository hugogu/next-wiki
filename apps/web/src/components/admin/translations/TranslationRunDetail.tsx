'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TranslationRunItemView, TranslationRunView } from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getPageHref, getTranslatedPageHref } from '@/lib/path';
import { useTranslation } from '@/i18n/client';
import { TranslationRunControls, runStatusTone } from './TranslationRunControls';

const TERMINAL: TranslationRunView['status'][] = [
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
];

function itemTone(status: TranslationRunItemView['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'skipped' || status === 'superseded') return 'neutral' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'cancelled') return 'warning' as const;
  return 'info' as const;
}

export function TranslationRunDetail({
  run,
  items,
}: {
  run: TranslationRunView;
  items: TranslationRunItemView[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const active = !TERMINAL.includes(run.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 2_000);
    return () => clearInterval(timer);
  }, [active, router]);

  return (
    <div className="space-y-md px-lg py-md">
      <Link className="text-sm text-primary hover:underline" href="/admin/translations?tab=runs">
        {t('common.actions.back')}
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <h1 className="font-display text-xl font-semibold uppercase">{run.targetLocale}</h1>
          <StatusBadge tone={runStatusTone(run.status)}>
            {t(`translation.status.${run.status}`)}
          </StatusBadge>
          {run.modelName && <span className="text-sm text-muted">{run.modelName}</span>}
        </div>
        <TranslationRunControls run={run} />
      </div>

      <div className="grid grid-cols-2 gap-sm text-sm md:grid-cols-4">
        <Stat label={t('admin.transfers.table.progress')} value={t('translation.run.progress', { processed: run.processedItems, total: run.totalItems })} />
        <Stat label={t('translation.item.completed')} value={String(run.completedItems)} />
        <Stat label={t('translation.item.failed')} value={String(run.failedItems)} />
        <Stat label={t('translation.item.superseded')} value={String(run.supersededItems)} />
        <Stat
          label={t('translation.usage.reported')}
          value={`${run.usage.inputTokens ?? 0} / ${run.usage.outputTokens ?? 0}`}
        />
        <Stat label={t('translation.usage.duration')} value={`${Math.round(run.totalDurationMs / 1000)}s`} />
        {run.predecessorRunId && (
          <Stat
            label={t('translation.run.retry')}
            value={
              <Link className="text-primary hover:underline" href={`/admin/translations/${run.predecessorRunId}`}>
                #{run.predecessorRunId.slice(0, 8)}
              </Link>
            }
          />
        )}
      </div>

      {run.errorMessage && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-sm text-sm text-danger">
          {run.errorCode}: {run.errorMessage}
        </p>
      )}

      <h2 className="text-sm font-semibold text-muted">{t('translation.run.detail.items')}</h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-border p-md text-sm text-muted">{t('translation.run.empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>{t('translation.document.source')}</DataTableHeader>
              <DataTableHeader>{t('admin.transfers.table.status')}</DataTableHeader>
              <DataTableHeader>{t('translation.usage.reported')}</DataTableHeader>
              <DataTableHeader>{t('translation.usage.duration')}</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {items.map((item) => (
              <DataTableRow key={item.id}>
                <DataTableCell className="font-mono text-xs">
                  {item.targetPath ? (
                    <span className="flex items-center gap-sm">
                      <Link
                        href={getPageHref(item.targetPath)}
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        {item.targetPath}
                      </Link>
                      {item.status === 'completed' && (
                        <Link
                          href={getTranslatedPageHref(run.targetLocale, item.targetPath)}
                          target="_blank"
                          className="text-muted hover:underline"
                        >
                          /{run.targetLocale}
                        </Link>
                      )}
                    </span>
                  ) : (
                    item.sourcePageId
                  )}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={itemTone(item.status)}>
                    {t(`translation.item.${item.status}`)}
                  </StatusBadge>
                  {item.errorCode && (
                    <div
                      className="mt-xs max-w-md truncate text-xs text-danger"
                      title={item.errorMessage ?? item.errorCode}
                    >
                      {item.errorCode}
                      {item.errorMessage ? `: ${item.errorMessage}` : ''}
                    </div>
                  )}
                </DataTableCell>
                <DataTableCell>
                  {item.usage.source === 'unavailable'
                    ? t('translation.usage.unavailable')
                    : `${item.usage.inputTokens ?? 0} / ${item.usage.outputTokens ?? 0}`}
                </DataTableCell>
                <DataTableCell>{item.durationMs != null ? `${Math.round(item.durationMs / 1000)}s` : '—'}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-sm">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-xs font-medium">{value}</div>
    </div>
  );
}
