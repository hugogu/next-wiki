'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { MigrationView } from '@next-wiki/shared';
import { apiGet, useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const ACTIVE = ['pending', 'copying', 'verifying'];

const STATUS_LABEL: Record<MigrationView['status'], TranslationKey> = {
  pending: 'admin.storage.migration.status.pending',
  copying: 'admin.storage.migration.status.copying',
  verifying: 'admin.storage.migration.status.verifying',
  completed: 'admin.storage.migration.status.completed',
  failed: 'admin.storage.migration.status.failed',
  aborted: 'admin.storage.migration.status.aborted',
};

export function MigrationStatus({ initial }: { initial: MigrationView }) {
  const { t } = useTranslation();

  const { data } = useQuery({
    queryKey: ['migration', initial.id],
    queryFn: () => apiGet<MigrationView>(`/api/storage/migrations/${initial.id}`),
    initialData: initial,
    refetchInterval: (query) =>
      ACTIVE.includes(query.state.data?.status ?? '') ? 1500 : false,
  });

  const migration = data ?? initial;
  const isActive = ACTIVE.includes(migration.status);
  const phaseTotal = migration.totalItems || 0;
  const phaseDone = migration.status === 'verifying' ? migration.verifiedItems : migration.copiedItems;
  const percent = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;

  const abort = useApiMutation<void, MigrationView>(`/api/storage/migrations/${initial.id}`, {
    method: 'DELETE',
  });

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-md">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">{t('admin.storage.migration.heading')}</h2>
        <span className="text-sm font-medium">{t(STATUS_LABEL[migration.status])}</span>
      </div>

      {isActive && (
        <div className="mt-sm">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-xs text-sm text-muted">
            {t('admin.storage.migration.progress', {
              done: phaseDone,
              total: phaseTotal,
              percent,
            })}
            {migration.abortRequested ? ` · ${t('admin.storage.migration.aborting')}` : ''}
          </p>
        </div>
      )}

      {migration.status === 'failed' && migration.errorMessage && (
        <p className="mt-sm text-sm text-danger" role="alert">
          {migration.errorMessage}
        </p>
      )}

      <div className="mt-md flex items-center gap-sm">
        {isActive && !migration.abortRequested && (
          <Button variant="danger" onClick={() => abort.mutate()} disabled={abort.isPending}>
            {t('admin.storage.migration.abort')}
          </Button>
        )}
        <Link href="/admin/storage" className="text-sm text-primary hover:underline">
          {t('admin.storage.migration.backToStorage')}
        </Link>
      </div>
    </section>
  );
}
