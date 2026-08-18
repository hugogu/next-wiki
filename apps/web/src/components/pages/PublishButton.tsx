'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPublicApiPagePublicationUrl, getSpaceHref, type ReaderSpace } from '@/lib/path';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { getLocalizedErrorMessage } from '@/i18n/error-messages';
import { PublishIcon, UndoIcon } from '@/components/icons';

export function PublishButton({
  pageId,
  path,
  space = 'wiki',
  version,
  iconOnly = false,
  variant = 'publish',
}: {
  pageId: string;
  path: string;
  space?: ReaderSpace;
  version: number;
  iconOnly?: boolean;
  variant?: 'publish' | 'restore';
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<Record<string, never>, unknown>(
    getPublicApiPagePublicationUrl(pageId, version),
    {
      onSuccess: () => {
        window.location.href = getSpaceHref(space, path);
      },
      onError: (err: ApiError) => {
        if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
          setError(t('page.publish.error.forbidden'));
        } else {
          setError(getLocalizedErrorMessage(t, err, 'page.publish.error.generic'));
        }
      },
    },
  );

  const label =
    variant === 'restore'
      ? t('page.publish.button.restore')
      : t('page.publish.button.submit');
  const pendingLabel =
    variant === 'restore'
      ? t('page.publish.button.restoring')
      : t('page.publish.button.submitting');

  return (
    <div className="space-y-xs">
      {error && <Alert>{error}</Alert>}
      <Button
        type="button"
        variant={variant === 'restore' ? 'secondary' : 'primary'}
        size={iconOnly ? 'icon' : 'default'}
        className={iconOnly ? 'h-8 w-8' : ''}
        aria-label={label}
        title={label}
        disabled={publish.isPending}
        onClick={() => {
          setError(null);
          publish.mutate({});
        }}
      >
        {iconOnly ? (
          variant === 'restore' ? (
            <UndoIcon className="h-4 w-4" />
          ) : (
            <PublishIcon className="h-4 w-4" />
          )
        ) : publish.isPending ? (
          pendingLabel
        ) : (
          label
        )}
      </Button>
    </div>
  );
}
