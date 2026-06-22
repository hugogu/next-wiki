'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransferRunAccepted, TransferRunView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

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
        <a
          className="inline-flex items-center rounded-md bg-primary px-md py-sm text-sm text-primary-text hover:bg-primary/90"
          href={`/api/transfer-artifacts/${run.reportArtifactId}/content`}
        >
          {t('admin.transfers.actions.download')}
        </a>
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
  const start = useApiMutation<{ kind: 'site_export' }, TransferRunAccepted>('/api/transfers');
  const active = runs.some((run) => run.status === 'queued' || run.status === 'running');

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
            onClick={() => start.mutate({ kind: 'site_export' }, { onSuccess: () => router.refresh() })}
          >
            {start.isPending ? t('admin.transfers.export.starting') : t('admin.transfers.export.start')}
          </Button>
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
