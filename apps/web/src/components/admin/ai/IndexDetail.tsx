'use client';

import type { AiIndexView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { TranslationKey } from '@/i18n/types';

export function IndexDetail({ index }: { index: AiIndexView }) {
  const { t } = useTranslation();
  const [failedPages, setFailedPages] = useState<Array<{ pageId: string; lastErrorCode?: string | null }> | null>(null);
  return (
    <div className="space-y-md rounded-lg border border-border bg-surface p-md">
      <h1 className="font-display text-xl font-semibold">{t('admin.ai.indexDetail.title')}</h1>
      <dl className="grid gap-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted">{t('admin.ai.indexDetail.status')}</dt><dd><StatusBadge>{t(`admin.ai.indexStatus.${index.status}` as TranslationKey)}</StatusBadge></dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.index.dimensions')}</dt><dd>{index.embeddingDimensions}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.indexDetail.completed')}</dt><dd>{index.completedPages}/{index.totalPages}</dd></div>
        <div><dt className="text-xs text-muted">{t('admin.ai.index.failed')}</dt><dd>{index.failedPages}</dd></div>
      </dl>
      {index.failedPages > 0 && (
        <div className="space-y-sm">
          <div className="flex gap-sm">
            <Button variant="secondary" onClick={async () => {
              const response = await fetch(`/api/ai/indexes/${index.id}/pages?status=failed`);
              if (response.ok) {
                const body = await response.json();
                setFailedPages(Array.isArray(body) ? body : body.items ?? []);
              }
            }}>{t('admin.ai.indexDetail.showFailed')}</Button>
            <Button onClick={async () => {
              await fetch(`/api/ai/indexes/${index.id}/page-retries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pageIds: [] }) });
              window.location.reload();
            }}>{t('admin.ai.index.retry')}</Button>
          </div>
          {failedPages && <ul className="space-y-xs text-sm">{failedPages.map((page) => <li key={page.pageId} className="font-mono">{page.pageId} · {page.lastErrorCode ?? 'failed'}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
