'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransferRunAccepted, TransferRunView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoIcon } from '@/components/icons';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { TransferArtifactDownloadButton } from './TransferArtifactDownloadButton';

function tone(status: TransferRunView['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'completed_with_warnings') return 'warning' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  return 'info' as const;
}

function ExportRunActions({ run }: { run: TransferRunView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const cancel = useApiMutation(`/api/transfers/${run.id}/cancellation`);
  const retry = useApiMutation(`/api/transfers/${run.id}/retries`);

  return (
    <div className="flex items-center gap-xs">
      {run.reportArtifactId && (
        <TransferArtifactDownloadButton url={`/api/transfer-artifacts/${run.reportArtifactId}/content`} />
      )}
      {run.canCancel && (
        <Button
          variant="secondary"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(undefined, { onSuccess: () => router.refresh() })}
        >
          {t('admin.transfers.actions.cancel')}
        </Button>
      )}
      {run.canRetry && (
        <Button
          disabled={retry.isPending}
          onClick={() => retry.mutate(undefined, { onSuccess: () => router.refresh() })}
        >
          {t('admin.transfers.actions.retry')}
        </Button>
      )}
    </div>
  );
}

export function ExportPanel({ runs }: { runs: TransferRunView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const start = useApiMutation<
    { kind: 'site_export'; options: { includeHistory: boolean; historyLimit: number } },
    TransferRunAccepted
  >('/api/transfers');
  const active = runs.some((run) => run.status === 'queued' || run.status === 'running');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(300);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return (
    <section className="space-y-md">
      <div className="rounded-lg border border-border bg-surface-elevated p-md">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.transfers.export.title')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.transfers.export.description')}</p>
          </div>
          <Button
            disabled={start.isPending}
            onClick={() => start.mutate({ kind: 'site_export', options: { includeHistory, historyLimit } }, { onSuccess: () => router.refresh() })}
          >
            {start.isPending ? t('admin.transfers.export.starting') : t('admin.transfers.export.start')}
          </Button>
        </div>
        <div className="mt-sm flex flex-wrap items-center gap-sm border-t border-border pt-sm text-sm">
          <div className="flex items-center gap-xs">
            <label className="flex items-center gap-xs">
              <input
                type="checkbox"
                checked={includeHistory}
                disabled={start.isPending}
                onChange={(event) => setIncludeHistory(event.target.checked)}
              />
              {t('admin.transfers.export.includeHistory')}
            </label>
            {/* Kept outside the <label> — nesting it there made clicking
                the icon also toggle the checkbox via label activation. */}
            <Tooltip label={t('admin.transfers.export.includeHistoryHelp')}>
              <span className="inline-flex text-muted" tabIndex={0} role="img" aria-label={t('admin.transfers.export.includeHistoryHelp')}>
                <InfoIcon className="h-4 w-4" />
              </span>
            </Tooltip>
          </div>
          {includeHistory && (
            <label className="flex items-center gap-xs whitespace-nowrap text-muted">
              {t('admin.transfers.export.historyLimit')}
              <Input
                type="number"
                min={1}
                max={2000}
                value={historyLimit}
                disabled={start.isPending}
                className="w-20"
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed) && parsed > 0) setHistoryLimit(Math.min(2000, Math.floor(parsed)));
                }}
              />
            </label>
          )}
        </div>
        {start.error && <p className="mt-sm text-sm text-danger">{start.error.message}</p>}
      </div>
      {runs.length === 0 ? (
        <p className="rounded-lg border border-border p-md text-sm text-muted">{t('admin.transfers.history.empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>{t('admin.transfers.table.kind')}</DataTableHeader>
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
                  <Link className="font-medium text-primary hover:underline" href={`/admin/transfers/${run.id}`}>
                    {t(`admin.transfers.kind.${run.kind}`)}
                  </Link>
                </DataTableCell>
                <DataTableCell><StatusBadge tone={tone(run.status)}>{t(`admin.transfers.status.${run.status}`)}</StatusBadge></DataTableCell>
                <DataTableCell>{run.processedItems}/{run.totalItems}</DataTableCell>
                <DataTableCell>{new Date(run.queuedAt).toLocaleString()}</DataTableCell>
                <DataTableCell><ExportRunActions run={run} /></DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}
