'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPageHref, getPublicApiPagePublicationUrl } from '@/lib/path';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { getLocalizedErrorMessage } from '@/i18n/error-messages';
import { PublishIcon } from '@/components/icons';

export function PublishButton({
  pageId,
  path,
  version,
  iconOnly = false,
}: {
  pageId: string;
  path: string;
  version: number;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<Record<string, never>, unknown>(
    getPublicApiPagePublicationUrl(pageId, version),
    {
      onSuccess: () => {
        window.location.href = getPageHref(path);
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

  return (
    <div className="space-y-xs">
      {error && <Alert>{error}</Alert>}
      <Button
        type="button"
        variant="primary"
        size={iconOnly ? 'icon' : 'default'}
        className={iconOnly ? 'h-8 w-8' : ''}
        aria-label={t('page.publish.button.submit')}
        title={t('page.publish.button.submit')}
        disabled={publish.isPending}
        onClick={() => {
          setError(null);
          publish.mutate({});
        }}
      >
        {iconOnly ? (
          <PublishIcon className="h-4 w-4" />
        ) : publish.isPending ? (
          t('page.publish.button.submitting')
        ) : (
          t('page.publish.button.submit')
        )}
      </Button>
    </div>
  );
}
