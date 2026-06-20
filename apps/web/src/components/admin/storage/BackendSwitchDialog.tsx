'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTranslation } from '@/i18n/client';

/**
 * Confirms switching the active backend, which launches a migration. If the
 * target already contains data the server returns 409 and the dialog re-confirms
 * with an explicit overwrite warning (FR-020).
 */
export function BackendSwitchDialog({
  targetBackendId,
  targetLabel,
  onClose,
}: {
  targetBackendId: string;
  targetLabel: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const start = useApiMutation<{ targetBackendId: string; confirmOverwrite?: boolean }, { id: string }>(
    '/api/storage/migrations',
    { method: 'POST' },
  );

  const onConfirm = () => {
    setError(undefined);
    start.mutate(
      { targetBackendId, confirmOverwrite: overwrite || undefined },
      {
        onSuccess: ({ id }) => router.push(`/admin/storage/migrations/${id}`),
        onError: (e: ApiError) => {
          // Target not empty → ask again with an explicit overwrite warning.
          if (!overwrite && /contains data/i.test(e.message)) {
            setOverwrite(true);
            setError(undefined);
          } else {
            setError(e.message);
          }
        },
      },
    );
  };

  return (
    <ConfirmDialog
      title={t('admin.storage.switch.title', { target: targetLabel })}
      message={
        overwrite
          ? t('admin.storage.switch.overwriteWarning', { target: targetLabel })
          : t('admin.storage.switch.message', { target: targetLabel })
      }
      confirmLabel={overwrite ? t('admin.storage.switch.confirmOverwrite') : t('admin.storage.switch.confirm')}
      confirmVariant={overwrite ? 'danger' : 'primary'}
      pending={start.isPending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}
