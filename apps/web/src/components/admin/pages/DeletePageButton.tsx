'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TrashIcon } from '@/components/icons';
import { apiDelete, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

export function DeletePageButton({ pageId, title }: { pageId: string; title: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setPending(true);
    setError(null);
    try {
      await apiDelete<{ ok: true }>(`/api/admin/pages/${encodeURIComponent(pageId)}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || t('admin.pages.delete.error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('admin.pages.actions.delete')}
        title={t('admin.pages.actions.delete')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <TrashIcon />
      </button>
      {open && (
        <ConfirmDialog
          title={t('admin.pages.delete.title')}
          message={t('admin.pages.delete.message', { title })}
          confirmLabel={t('admin.pages.delete.confirm')}
          confirmVariant="danger"
          pending={pending}
          error={error ?? undefined}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!pending) setOpen(false);
          }}
        />
      )}
    </>
  );
}
