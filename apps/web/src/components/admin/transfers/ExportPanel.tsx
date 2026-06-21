'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { TransferRunAccepted, TransferRunView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { TransferRunList } from './TransferRunList';

export function ExportPanel({ runs }: { runs: TransferRunView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const start = useApiMutation<{ kind: 'site_export' }, TransferRunAccepted>('/api/transfers');
  const active = runs.some((run) => run.status === 'queued' || run.status === 'running');

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return (
    <section className="space-y-md">
      <div className="rounded-lg border border-border bg-surface-elevated p-md">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.transfers.export.title')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.transfers.export.description')}</p>
          </div>
          <Button
            disabled={start.isPending}
            onClick={() => start.mutate({ kind: 'site_export' }, { onSuccess: () => router.refresh() })}
          >
            {start.isPending ? t('admin.transfers.export.starting') : t('admin.transfers.export.start')}
          </Button>
        </div>
        {start.error && <p className="mt-sm text-sm text-danger">{start.error.message}</p>}
      </div>
      <TransferRunList runs={runs} />
    </section>
  );
}
