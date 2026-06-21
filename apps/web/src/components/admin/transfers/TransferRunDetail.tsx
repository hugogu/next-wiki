'use client';

import { useRouter } from 'next/navigation';
import type { TransferItemView, TransferRunView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

export function TransferRunDetail({
  run,
  items,
}: {
  run: TransferRunView;
  items: TransferItemView[];
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const cancel = useApiMutation(`/api/transfers/${run.id}/cancellation`);
  const retry = useApiMutation(`/api/transfers/${run.id}/retries`);
  return (
    <div className="space-y-md">
      <section className="rounded-lg border border-border p-md">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <div>
            <h1 className="font-display text-xl font-semibold">{t(`admin.transfers.kind.${run.kind}`)}</h1>
            <p className="mt-xs text-sm text-muted">{run.processedItems}/{run.totalItems} · {t(`admin.transfers.status.${run.status}`)}</p>
          </div>
          <div className="flex gap-sm">
            {run.canCancel && <Button variant="secondary" onClick={() => cancel.mutate(undefined, { onSuccess: () => router.refresh() })}>{t('admin.transfers.actions.cancel')}</Button>}
            {run.canRetry && <Button onClick={() => retry.mutate(undefined, { onSuccess: () => router.refresh() })}>{t('admin.transfers.actions.retry')}</Button>}
            {run.reportArtifactId && <a className="inline-flex items-center rounded-md bg-primary px-md py-sm text-sm text-primary-text" href={`/api/transfer-artifacts/${run.reportArtifactId}/content`}>{t('admin.transfers.actions.download')}</a>}
          </div>
        </div>
        {run.errorMessage && <p className="mt-md text-sm text-danger">{run.errorMessage}</p>}
        {run.errorDetail && <pre className="mt-sm overflow-auto rounded-md bg-surface-elevated p-sm text-xs">{run.errorDetail}</pre>}
      </section>
      <section className="space-y-xs">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-border p-sm text-sm">
            <div className="flex justify-between gap-sm"><span>{item.displayName}</span><span className="text-muted">{item.action} · {item.status}</span></div>
            {(item.warningMessage || item.errorMessage) && <p className="mt-xs text-xs text-danger">{item.warningMessage ?? item.errorMessage}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
