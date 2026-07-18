'use client';

import { useState } from 'react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

type Visibility = 'public' | 'restricted';

export function SwitchModeDialog({
  onAccepted,
  onClose,
}: {
  onAccepted: (jobId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [rawVisibility, setRawVisibility] = useState<Visibility>('restricted');
  const [generatedVisibility, setGeneratedVisibility] = useState<Visibility>('restricted');
  const [error, setError] = useState<string | null>(null);
  const switchMode = useApiMutation<
    { mode: 'copilot'; rawVisibility: Visibility; generatedVisibility: Visibility },
    { jobId: string }
  >('/api/settings/writing-mode', { method: 'PUT' });

  const submit = () => {
    setError(null);
    switchMode.mutate(
      { mode: 'copilot', rawVisibility, generatedVisibility },
      {
        onSuccess: ({ jobId }) => onAccepted(jobId),
        onError: (response: ApiError) => setError(response.message),
      },
    );
  };

  return (
    <ModalDialog
      title={t('admin.writingMode.dialog.title')}
      description={t('admin.writingMode.dialog.description')}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-md">
        <Alert>{t('admin.writingMode.dialog.warning')}</Alert>
        <label className="block space-y-xs text-sm font-medium">
          <span>{t('admin.writingMode.dialog.rawVisibility')}</span>
          <Select value={rawVisibility} onChange={(event) => setRawVisibility(event.target.value as Visibility)}>
            <option value="public">{t('admin.writingMode.visibility.public')}</option>
            <option value="restricted">{t('admin.writingMode.visibility.restricted')}</option>
          </Select>
        </label>
        <label className="block space-y-xs text-sm font-medium">
          <span>{t('admin.writingMode.dialog.generatedVisibility')}</span>
          <Select value={generatedVisibility} onChange={(event) => setGeneratedVisibility(event.target.value as Visibility)}>
            <option value="public">{t('admin.writingMode.visibility.public')}</option>
            <option value="restricted">{t('admin.writingMode.visibility.restricted')}</option>
          </Select>
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-sm">
          <Button variant="ghost" onClick={onClose}>{t('common.actions.cancel')}</Button>
          <Button variant="danger" onClick={submit} disabled={switchMode.isPending}>
            {switchMode.isPending ? t('admin.writingMode.switching') : t('admin.writingMode.dialog.confirm')}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
