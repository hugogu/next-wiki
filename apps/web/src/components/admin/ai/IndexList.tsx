'use client';

import Link from 'next/link';
import type { AiIndexView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';

export function IndexList({ indexes }: { indexes: AiIndexView[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-md">
      <Button onClick={async () => {
        const response = await fetch('/api/ai/indexes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'manual' }) });
        if (response.ok) window.location.reload();
      }}>{t('admin.ai.index.rebuild')}</Button>
      {indexes.map((index) => (
        <Link key={index.id} href={`/admin/ai/indexes/${index.id}`} className="block rounded-lg border border-border bg-surface p-md hover:bg-surface-elevated">
          <div className="flex justify-between"><span>{index.modelName}</span><span>{index.status}{index.isActive ? ' · active' : ''}</span></div>
          <p className="mt-xs text-sm text-muted">{index.completedPages}/{index.totalPages} · {index.failedPages} failed</p>
        </Link>
      ))}
    </div>
  );
}
