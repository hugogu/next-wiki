'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TrashIcon } from '@/components/icons';
import { apiDelete, type ApiError } from '@/lib/api/client';
import { getPublicApiPageRevisionUrl, getSpaceHistoryHref, type ReaderSpace } from '@/lib/path';
import { useTranslation } from '@/i18n/client';

export function DeleteRevisionButton({
  pageId,
  path,
  space = 'wiki',
  version,
}: {
  pageId: string;
  path: string;
  space?: ReaderSpace;
  version: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = t('page.history.delete.action', { version });

  const handleDelete = async () => {
    setPending(true);
    setError(null);
    try {
      await apiDelete<void>(getPublicApiPageRevisionUrl(pageId, version));
      setOpen(false);
      // Reset to the bare history URL: a `compare`/`selected` query naming the
      // now-deleted version would otherwise 404 on refresh (see the History
      // page's explicit-pair 404 guard).
      router.push(getSpaceHistoryHref(space, path));
      router.refresh();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || t('page.history.delete.error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="danger"
        size="icon"
        className="h-8 w-8"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        <TrashIcon className="h-4 w-4" />
      </Button>
      {open && (
        <ConfirmDialog
          title={t('page.history.delete.title')}
          message={t('page.history.delete.message', { version })}
          confirmLabel={t('page.history.delete.confirm')}
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
