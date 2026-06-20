'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StorageBackendView, StorageBackendType, CleanupJobView } from '@next-wiki/shared';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BackendSwitchDialog } from './BackendSwitchDialog';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const TYPE_LABEL: Record<StorageBackendType, TranslationKey> = {
  database: 'admin.storage.type.database',
  local: 'admin.storage.type.local',
  s3: 'admin.storage.type.s3',
  git: 'admin.storage.type.git',
};

export function StorageBackendActions({ backends }: { backends: StorageBackendView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [switchTarget, setSwitchTarget] = useState<StorageBackendView | null>(null);
  const [cleanupTarget, setCleanupTarget] = useState<StorageBackendView | null>(null);
  const [cleanupError, setCleanupError] = useState<string | undefined>();

  // Only authoritative (non-git) backends that are not currently active.
  const switchable = backends.filter((b) => !b.isActive && b.type !== 'database');

  const cleanup = useApiMutation<{ backendId: string; confirm: true }, CleanupJobView>(
    '/api/storage/cleanup-jobs',
    { method: 'POST' },
  );

  const confirmCleanup = () => {
    if (!cleanupTarget) return;
    setCleanupError(undefined);
    cleanup.mutate(
      { backendId: cleanupTarget.id, confirm: true },
      {
        onSuccess: () => {
          setCleanupTarget(null);
          router.refresh();
        },
        onError: (e: ApiError) => setCleanupError(e.message),
      },
    );
  };

  if (switchable.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-md">
      <h2 className="font-display font-semibold text-lg">{t('admin.storage.actions.heading')}</h2>
      <ul className="mt-sm divide-y divide-border">
        {switchable.map((b) => (
          <li key={b.id} className="flex items-center justify-between py-sm">
            <span className="text-sm font-medium">{t(TYPE_LABEL[b.type])}</span>
            <span className="flex gap-sm">
              <Button onClick={() => setSwitchTarget(b)}>{t('admin.storage.actions.switch')}</Button>
              <Button variant="ghost" onClick={() => setCleanupTarget(b)}>
                {t('admin.storage.actions.cleanup')}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {switchTarget && (
        <BackendSwitchDialog
          targetBackendId={switchTarget.id}
          targetLabel={t(TYPE_LABEL[switchTarget.type])}
          onClose={() => setSwitchTarget(null)}
        />
      )}

      {cleanupTarget && (
        <ConfirmDialog
          title={t('admin.storage.cleanup.title')}
          message={t('admin.storage.cleanup.message', { target: t(TYPE_LABEL[cleanupTarget.type]) })}
          confirmLabel={t('admin.storage.cleanup.confirm')}
          confirmVariant="danger"
          pending={cleanup.isPending}
          error={cleanupError}
          onConfirm={confirmCleanup}
          onCancel={() => setCleanupTarget(null)}
        />
      )}
    </section>
  );
}
