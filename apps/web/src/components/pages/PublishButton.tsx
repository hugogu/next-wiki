'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPageHref } from '@/lib/path';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export function PublishButton({ path, version }: { path: string; version: number }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<{ path: string; version: number }, { versionId: string }>('/api/revisions/publish', {
    onSuccess: () => {
      window.location.href = getPageHref(path);
    },
    onError: (err: ApiError) => {
      if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setError(t('page.publish.error.forbidden'));
      } else {
        setError(err.message || t('page.publish.error.generic'));
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
          publish.mutate({ path, version });
        }}
      >
        {publish.isPending ? t('page.publish.button.submitting') : t('page.publish.button.submit')}
      </Button>
    </div>
  );
}
