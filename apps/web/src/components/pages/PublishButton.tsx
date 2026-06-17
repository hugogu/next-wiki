'use client';

import { useState } from 'react';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export function PublishButton({ slug, version }: { slug: string; version: number }) {
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<{ slug: string; version: number }, { versionId: string }>('/api/revisions/publish', {
    onSuccess: () => {
      // Hard navigate so the server re-renders the now-live page.
      window.location.href = `/${slug}`;
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
          publish.mutate({ slug, version });
        }}
      >
        {publish.isPending ? 'Publishing...' : 'Publish this revision'}
      </Button>
    </div>
  );
}
