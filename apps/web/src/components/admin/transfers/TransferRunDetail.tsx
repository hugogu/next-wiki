'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TransferCleanupResult, TransferItemList, TransferItemView, TransferRunView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { apiGet, useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

const PAGE_SIZE = 20;
const TERMINAL: TransferRunView['status'][] = ['completed', 'completed_with_warnings', 'failed', 'cancelled'];

export function TransferRunDetail({
  run: initialRun,
  items: initialItems,
  total: initialTotal,
}: {
  run: TransferRunView;
  items: TransferItemView[];
  total: number;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const cancel = useApiMutation(`/api/transfers/${initialRun.id}/cancellation`);
  const retry = useApiMutation(`/api/transfers/${initialRun.id}/retries`);
  const pause = useApiMutation(`/api/transfers/${initialRun.id}/pause`);
  const resume = useApiMutation(`/api/transfers/${initialRun.id}/resume`);
  const cleanup = useApiMutation<void, TransferCleanupResult>(`/api/transfers/${initialRun.id}/cleanup`);

  const [run, setRun] = useState(initialRun);
  const [confirmingCleanup, setConfirmingCleanup] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<TransferItemView['status'] | 'all'>('all');
  const active = !TERMINAL.includes(run.status);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadItems = useCallback(
    async (targetPage: number, targetFilter: typeof filter = filter) => {
      const statusParam = targetFilter === 'all' ? '' : `&status=${targetFilter}`;
      const result = await apiGet<TransferItemList>(
        `/api/transfers/${initialRun.id}/items?limit=${PAGE_SIZE}&offset=${targetPage * PAGE_SIZE}${statusParam}`,
      );
      setItems(result.items);
      setTotal(result.total);
      setPage(targetPage);
    },
    [initialRun.id, filter],
  );

  const applyFilter = useCallback(
    (next: typeof filter) => {
      setFilter(next);
      void loadItems(0, next);
    },
    [loadItems],
  );

  // While the run is active, poll the run status and the visible item page so
  // progress updates without a manual refresh (bug: progress only on finish).
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      const fresh = await apiGet<TransferRunView>(`/api/transfers/${initialRun.id}`).catch(() => null);
      if (fresh) setRun(fresh);
      await loadItems(page, filter).catch(() => undefined);
    }, 2_000);
    return () => clearInterval(timer);
  }, [active, initialRun.id, loadItems, page, filter]);

  return (
    <div className="space-y-md">
      <section className="rounded-lg border border-border p-md">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <div>
            <h1 className="font-display text-xl font-semibold">{t(`admin.transfers.kind.${run.kind}`)}</h1>
            <p className="mt-xs text-sm text-muted">
              {run.processedItems}/{run.totalItems} · {t(`admin.transfers.status.${run.status}`)}
              {run.warningItems > 0 && (
                <span className="text-warning"> · {t('admin.transfers.detail.warningCount', { count: run.warningItems })}</span>
              )}
            </p>
          </div>
          <div className="flex gap-sm">
            {run.canPause && !run.pauseRequested && <Button variant="secondary" onClick={() => pause.mutate(undefined, { onSuccess: () => router.refresh() })}>{t('admin.transfers.actions.pause')}</Button>}
            {run.canResume && <Button onClick={() => resume.mutate(undefined, { onSuccess: () => router.refresh() })}>{t('admin.transfers.actions.resume')}</Button>}
            {run.canCancel && <Button variant="secondary" onClick={() => cancel.mutate(undefined, { onSuccess: () => router.refresh() })}>{t('admin.transfers.actions.cancel')}</Button>}
            {run.canRetry && <Button onClick={() => retry.mutate(undefined, { onSuccess: () => router.refresh() })}>{t('admin.transfers.actions.retry')}</Button>}
            {run.canCleanup && <Button variant="danger" onClick={() => setConfirmingCleanup(true)}>{t('admin.transfers.actions.cleanup')}</Button>}
            {run.reportArtifactId && <a className="inline-flex items-center rounded-md bg-primary px-md py-sm text-sm text-primary-text" href={`/api/transfer-artifacts/${run.reportArtifactId}/content`}>{t('admin.transfers.actions.download')}</a>}
          </div>
        </div>
        {cleanupMessage && <p className="mt-md text-sm text-success">{cleanupMessage}</p>}
        {run.errorMessage && <p className="mt-md text-sm text-danger">{run.errorMessage}</p>}
        {run.errorDetail && <pre className="mt-sm overflow-auto rounded-md bg-surface-elevated p-sm text-xs">{run.errorDetail}</pre>}
      </section>
      <section className="space-y-xs">
        <div className="flex flex-wrap items-center gap-sm">
          {([
            { key: 'all', count: run.totalItems },
            { key: 'warning', count: run.warningItems },
            { key: 'failed', count: run.failedItems },
          ] as const).map(({ key, count }) => (
            <Button
              key={key}
              type="button"
              variant={filter === key ? 'secondary' : 'ghost'}
              onClick={() => void applyFilter(key)}
            >
              {t(`admin.transfers.detail.filter.${key}`)}
              {count > 0 && (
                <span
                  className="ml-xs inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-xs text-xs text-white"
                  style={{
                    backgroundColor:
                      key === 'warning' ? 'var(--color-warning)' : key === 'failed' ? 'var(--color-danger)' : 'var(--color-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </Button>
          ))}
        </div>
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-border p-sm text-sm">
            <div className="flex justify-between gap-sm">
              <span className="truncate">{item.displayName}</span>
              <span className="shrink-0 text-muted">{item.action} · {item.status}</span>
            </div>
            {item.warningMessage && (
              <p className="mt-xs text-xs text-warning">
                {item.warningCode ? `${item.warningCode}: ` : ''}{item.warningMessage}
              </p>
            )}
            {item.errorMessage && (
              <p className="mt-xs text-xs text-danger">
                {item.errorCode ? `${item.errorCode}: ` : ''}{item.errorMessage}
              </p>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="rounded-md border border-border p-md text-sm text-muted">{t('admin.transfers.detail.noItems')}</p>
        )}
      </section>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" disabled={page <= 0} onClick={() => void loadItems(page - 1)}>
            <ChevronLeftIcon /><span className="ml-2">{t('userCenter.audit.prev')}</span>
          </Button>
          <span className="text-sm text-muted">
            {t('userCenter.audit.page')} {page + 1} {t('userCenter.audit.of')} {totalPages}
          </span>
          <Button type="button" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => void loadItems(page + 1)}>
            <span className="mr-2">{t('userCenter.audit.next')}</span><ChevronRightIcon />
          </Button>
        </div>
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
              onSuccess: (result) => {
                setConfirmingCleanup(false);
                setCleanupMessage(t('admin.transfers.detail.cleanupDone', { count: result.deletedPages }));
                router.refresh();
              },
            })
          }
        />
      )}
    </div>
  );
}
