'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  publicPagePropertiesInputSchema,
  type PublicPagePropertiesInput,
  type PublicPageResource,
} from '@next-wiki/shared';
import { SettingsIcon } from '@/components/icons';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPublicApiPageUrl } from '@/lib/path';
import { getLocalizedErrorMessage } from '@/i18n/error-messages';

/**
 * Admin-list "properties" action. Reuses the editor's properties dialog (title +
 * path) instead of a dedicated full page, and persists through the same public
 * PATCH endpoint the editor uses.
 */
export function PagePropertiesButton({
  pageId,
  initialTitle,
  initialPath,
}: {
  pageId: string;
  initialTitle: string;
  initialPath: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState<string | null>(null);

  const update = useApiMutation<PublicPagePropertiesInput, PublicPageResource>(getPublicApiPageUrl(pageId), {
    method: 'PATCH',
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
    onError: (err: ApiError) => {
      if (err.code === 'CONFLICT' || err.code === 'PAGE_PATH_CONFLICT') {
        setError(t('page.properties.error.pathExists'));
      } else if (err.code === 'PAGE_PATH_RESERVED') {
        setError(t('page.properties.error.pathReserved'));
      } else if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setError(t('page.properties.error.forbidden'));
      } else {
        setError(getLocalizedErrorMessage(t, err, 'page.properties.error.generic'));
      }
    },
  });

  const openDialog = () => {
    setTitle(initialTitle);
    setPath(initialPath);
    setError(null);
    setOpen(true);
  };

  const save = () => {
    setError(null);
    const parsed = publicPagePropertiesInputSchema.safeParse({ title, path });
    if (!parsed.success) {
      setError(getLocalizedErrorMessage(t, { code: 'VALIDATION_FAILED', message: '' }, 'page.properties.error.generic'));
      return;
    }
    update.mutate(parsed.data);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={t('admin.pages.actions.properties')}
        title={t('admin.pages.actions.properties')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <SettingsIcon />
      </button>
      {open && (
        <PagePropertiesPanel
          title={title}
          onTitleChange={setTitle}
          path={path}
          onPathChange={setPath}
          error={error}
          saving={update.isPending}
          onSave={save}
          onClose={() => {
            if (!update.isPending) setOpen(false);
          }}
        />
      )}
    </>
  );
}
