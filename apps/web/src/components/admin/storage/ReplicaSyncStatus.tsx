'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ReplicaSyncStatus as ReplicaSyncStatusView } from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

export function ReplicaSyncStatus({ initial }: { initial: ReplicaSyncStatusView }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['storage-replica-sync', initial.backendId],
    queryFn: () =>
      apiGet<ReplicaSyncStatusView>(`/api/storage/backends/${initial.backendId}/sync`),
    initialData: initial,
    refetchInterval: (query) =>
      ['backfilling', 'degraded'].includes(query.state.data?.state ?? '') ? 1500 : false,
  });

  const sync = data ?? initial;
  const percent =
    sync.totalItems > 0
      ? Math.round((sync.completedItems / sync.totalItems) * 100)
      : sync.state === 'enabled'
        ? 100
        : 0;

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-md">
      <div className="flex items-center justify-between gap-sm">
        <h2 className="font-display text-lg font-semibold">
          {t('admin.storage.sync.heading')}
        </h2>
        <span className="text-sm font-medium">
          {t(`admin.storage.replica.state.${sync.state}` as TranslationKey)}
        </span>
      </div>

      <div className="mt-md h-2 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-xs text-sm text-muted">
        {t('admin.storage.sync.progress', {
          done: sync.completedItems,
          total: sync.totalItems,
          percent,
        })}
      </p>

      {sync.failedItems > 0 && (
        <p className="mt-sm text-sm text-danger">
          {t('admin.storage.sync.failed', { count: sync.failedItems })}
        </p>
      )}
      {sync.lastError && <p className="mt-sm text-sm text-danger">{sync.lastError}</p>}

      <Link
        href={`/admin/storage?tab=${sync.backendType}`}
        className="mt-md inline-block text-sm text-primary hover:underline"
      >
        {t('admin.storage.sync.back')}
      </Link>
    </section>
  );
}
