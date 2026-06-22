'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransferRunView } from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

const TERMINAL: TransferRunView['status'][] = ['completed', 'completed_with_warnings', 'failed', 'cancelled'];

function tone(status: TransferRunView['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'completed_with_warnings') return 'warning' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  return 'info' as const;
}

function RunActions({ run }: { run: TransferRunView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const cancel = useApiMutation(`/api/transfers/${run.id}/cancellation`);
  const retry = useApiMutation(`/api/transfers/${run.id}/retries`);

  if (!run.canCancel && !run.canRetry) return null;

  return (
    <div className="flex items-center gap-xs">
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

export function TransferRunList({ runs }: { runs: TransferRunView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  // Refresh while any run is still in flight so progress advances live instead
  // of only updating once the run finishes.
  const hasActive = runs.some((run) => !TERMINAL.includes(run.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => router.refresh(), 2_000);
    return () => clearInterval(timer);
  }, [hasActive, router]);
  if (runs.length === 0) {
    return <p className="rounded-lg border border-border p-md text-sm text-muted">{t('admin.transfers.history.empty')}</p>;
  }
  return (
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
            <DataTableCell><RunActions run={run} /></DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
