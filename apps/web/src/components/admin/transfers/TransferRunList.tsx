'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransferCleanupResult, TransferRunView } from '@next-wiki/shared';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { PauseIcon, PlayIcon, RedoIcon, TrashIcon, XIcon } from '@/components/icons';
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
  const pause = useApiMutation(`/api/transfers/${run.id}/pause`);
  const resume = useApiMutation(`/api/transfers/${run.id}/resume`);
  const cleanup = useApiMutation<void, TransferCleanupResult>(`/api/transfers/${run.id}/cleanup`);
  const [confirmingCleanup, setConfirmingCleanup] = useState(false);

  if (!run.canCancel && !run.canRetry && !run.canPause && !run.canResume && !run.canCleanup) {
    return null;
  }

  return (
    <div className="flex items-center gap-xs">
      {run.canPause && !run.pauseRequested && (
        <Tooltip label={t('admin.transfers.actions.pause')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('admin.transfers.actions.pause')}
            disabled={pause.isPending}
            onClick={() => pause.mutate(undefined, { onSuccess: () => router.refresh() })}
          >
            <PauseIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canResume && (
        <Tooltip label={t('admin.transfers.actions.resume')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('admin.transfers.actions.resume')}
            disabled={resume.isPending}
            onClick={() => resume.mutate(undefined, { onSuccess: () => router.refresh() })}
          >
            <PlayIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canCancel && (
        <Tooltip label={t('admin.transfers.actions.cancel')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('admin.transfers.actions.cancel')}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSuccess: () => router.refresh() })}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canRetry && (
        <Tooltip label={t('admin.transfers.actions.retry')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('admin.transfers.actions.retry')}
            disabled={retry.isPending}
            onClick={() => retry.mutate(undefined, { onSuccess: () => router.refresh() })}
          >
            <RedoIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canCleanup && (
        <Tooltip label={t('admin.transfers.actions.cleanup')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('admin.transfers.actions.cleanup')}
            disabled={cleanup.isPending}
            onClick={() => setConfirmingCleanup(true)}
          >
            <TrashIcon className="h-4 w-4 text-danger" />
          </Button>
        </Tooltip>
      )}
      {confirmingCleanup && (
        <ConfirmDialog
          title={t('admin.transfers.actions.cleanup')}
          message={t('admin.transfers.detail.cleanupConfirm', { count: run.createdItems + run.replacedItems })}
          confirmLabel={t('admin.transfers.actions.cleanup')}
          confirmVariant="danger"
          pending={cleanup.isPending}
          error={cleanup.error?.message}
          onCancel={() => setConfirmingCleanup(false)}
          onConfirm={() =>
            cleanup.mutate(undefined, {
              onSuccess: () => {
                setConfirmingCleanup(false);
                router.refresh();
              },
            })
          }
        />
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
