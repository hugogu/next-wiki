'use client';

import { useState } from 'react';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPageHref } from '@/lib/path';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export function PublishButton({ path, version }: { path: string; version: number }) {
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<{ path: string; version: number }, { versionId: string }>('/api/revisions/publish', {
    onSuccess: () => {
      window.location.href = getPageHref(path);
    },
    onError: (err: ApiError) => {
      if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setError('You do not have permission to publish this revision.');
      } else {
        setError(err.message || 'Failed to publish revision.');
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
        {publish.isPending ? 'Publishing...' : 'Publish this revision'}
      </Button>
    </div>
  );
}
