'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPageHref, getPublicApiPagePublicationUrl } from '@/lib/path';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { getLocalizedErrorMessage } from '@/i18n/error-messages';

export function PublishButton({ pageId, path, version }: { pageId: string; path: string; version: number }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<Record<string, never>, unknown>(getPublicApiPagePublicationUrl(pageId, version), {
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
  });

  return (
    <div className="space-y-xs">
      {error && <Alert>{error}</Alert>}
      <Button
        type="button"
        variant="primary"
        disabled={publish.isPending}
        onClick={() => {
          setError(null);
          publish.mutate({});
        }}
      >
        {publish.isPending ? t('page.publish.button.submitting') : t('page.publish.button.submit')}
      </Button>
    </div>
  );
}
