'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';

type ConfirmResponse = { ok: boolean; displayName: string | null };

export function FeishuBindConfirm({ token }: { token: string | null }) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useApiMutation<{ token: string }, ConfirmResponse>('/api/feishu/bindings', {
    method: 'POST',
  });

  const onConfirm = async () => {
    if (!token) return;
    setErrorMessage(null);
    try {
      await mutation.mutateAsync({ token });
      setConfirmed(true);
    } catch (err) {
      const error = err as { message?: string };
      setErrorMessage(error.message || t('userCenter.feishu.errorGeneric'));
    }
  };

  return (
    <div className="space-y-md">
      <h2 className="font-display text-xl font-semibold">{t('userCenter.feishu.heading')}</h2>

      {!token ? (
        <p className="text-danger text-sm">{t('userCenter.feishu.missingToken')}</p>
      ) : confirmed ? (
        <p className="text-success text-sm">{t('userCenter.feishu.successMessage')}</p>
      ) : (
        <>
          <p className="text-muted text-sm">{t('userCenter.feishu.description')}</p>
          {errorMessage && <p className="text-danger text-sm">{errorMessage}</p>}
          <Button type="button" onClick={onConfirm} disabled={mutation.isPending}>
            {mutation.isPending
              ? t('userCenter.feishu.confirming')
              : t('userCenter.feishu.confirmButton')}
          </Button>
        </>
      )}
    </div>
  );
}
