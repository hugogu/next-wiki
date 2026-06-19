'use client';

import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-lg shadow-lg">
        <h3 className="font-display text-xl font-semibold mb-sm">{title}</h3>
        <p className="text-sm text-muted mb-lg">{message}</p>
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel ?? t('common.actions.cancel')}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={pending}>
            {confirmLabel ?? t('common.actions.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
