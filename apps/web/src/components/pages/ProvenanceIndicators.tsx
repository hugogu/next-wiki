'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiAttributionClearance, PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, type ApiError } from '@/lib/api/client';
import { XIcon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function ProvenanceIndicators({
  aiContentLevel,
  pageId,
  revisionId,
  canClear = false,
  className,
}: {
  aiContentLevel?: PublicPageResource['aiContentLevel'];
  pageId?: string;
  revisionId?: string;
  canClear?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (!aiContentLevel) return null;

  async function clear() {
    if (!pageId || !revisionId) return;
    setPending(true);
    setError(undefined);
    try {
      await apiPost<{ expectedRevisionId: string }, AiAttributionClearance>(
        `/api/v1/pages/${pageId}/ai-attribution/clearances`, { expectedRevisionId: revisionId },
      );
      setConfirming(false);
      router.refresh();
    } catch (err) {
      const code = (err as ApiError)?.code;
      setError(t(code === 'STALE_REVISION' ? 'page.indicators.clearAiStale' : 'page.indicators.clearAiError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={className} data-testid="page-provenance-indicators">
      <StatusBadge tone={aiContentLevel === 'generated' ? 'info' : 'warning'}>
        {t(aiContentLevel === 'generated' ? 'page.indicators.aiGenerated' : 'page.indicators.aiAssisted')}
        {canClear && pageId && revisionId && (
          <button
            type="button"
            className="ml-xs inline-flex rounded-full p-0.5 hover:bg-surface-elevated focus-visible:outline focus-visible:outline-primary"
            aria-label={t('page.indicators.clearAiLabel')}
            title={t('page.indicators.clearAiLabel')}
            onClick={() => { setError(undefined); setConfirming(true); }}
          >
            <XIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </StatusBadge>
      {confirming && (
        <ConfirmDialog
          title={t('page.indicators.clearAiTitle')}
          message={t('page.indicators.clearAiMessage')}
          confirmLabel={t('page.indicators.clearAiConfirm')}
          pending={pending}
          error={error}
          onConfirm={() => { void clear(); }}
          onCancel={() => { if (!pending) setConfirming(false); }}
        />
      )}
    </span>
  );
}
