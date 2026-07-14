'use client';

import { useState } from 'react';
import { apiDelete, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FeishuIcon } from '@/components/icons';

type Binding = {
  displayName: string | null;
  boundAt: string;
  lastSeenAt: string | null;
};

export function FeishuBindingPanel({
  configured,
  initialBinding,
}: {
  configured: boolean;
  initialBinding: Binding | null;
}) {
  const { t } = useTranslation();
  const [binding, setBinding] = useState(initialBinding);
  const [error, setError] = useState<string | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  const unbind = async () => {
    setError(null);
    setUnbinding(true);
    try {
      await apiDelete<{ ok: boolean; unbound: number }>('/api/feishu/bindings');
      setBinding(null);
    } catch (err) {
      setError((err as ApiError).message || t('userCenter.feishu.unbindFailed'));
    } finally {
      setUnbinding(false);
    }
  };

  if (!configured) {
    return <Alert>{t('userCenter.feishu.notAvailable')}</Alert>;
  }

  return (
    <section className="max-w-2xl space-y-lg rounded-lg border border-border bg-surface p-lg">
      <div className="flex items-start gap-md">
        <FeishuIcon className="h-9 w-9 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">{t('userCenter.feishu.settingsHeading')}</h2>
          <p className="mt-xs text-sm text-muted">{t('userCenter.feishu.settingsDescription')}</p>
        </div>
      </div>

      {binding ? (
        <div className="space-y-md rounded-md border border-border bg-background p-md">
          <div>
            <p className="font-medium text-success">{t('userCenter.feishu.connected')}</p>
            <p className="mt-xs text-sm text-muted">
              {t('userCenter.feishu.connectedAt', {
                date: new Date(binding.boundAt).toLocaleString(),
              })}
            </p>
          </div>
          <Button variant="danger" onClick={() => void unbind()} disabled={unbinding}>
            {unbinding ? t('userCenter.feishu.unbinding') : t('userCenter.feishu.unbind')}
          </Button>
        </div>
      ) : (
        <div className="space-y-md rounded-md border border-border bg-background p-md">
          <p className="font-medium">{t('userCenter.feishu.notConnected')}</p>
          <ol className="list-decimal space-y-xs pl-lg text-sm text-muted">
            <li>{t('userCenter.feishu.stepOne')}</li>
            <li>{t('userCenter.feishu.stepTwo')}</li>
            <li>{t('userCenter.feishu.stepThree')}</li>
          </ol>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </section>
  );
}
