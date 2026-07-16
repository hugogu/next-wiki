'use client';

import { useEffect, useId, useRef } from 'react';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  pending?: boolean;
  /** Inline error to surface when the confirmed action fails (dialog stays open). */
  error?: string;
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
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const messageId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const isDestructive = confirmVariant === 'danger';

  // Keep the latest onCancel without re-running the focus/keyboard effect on
  // every parent re-render (the parent typically passes a fresh closure).
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const buttons = () =>
      Array.from(cardRef.current?.querySelectorAll('button') ?? []) as HTMLButtonElement[];

    // Destructive confirms default focus to Cancel to avoid an accidental
    // Enter-confirm; otherwise focus the confirm action.
    const initial = buttons();
    (isDestructive ? initial[0] : initial[initial.length - 1])?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key === 'Tab') {
        // Minimal focus trap so Tab cycles within the dialog.
        const list = buttons();
        if (list.length === 0) return;
        const first = list[0]!;
        const last = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isDestructive]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md"
      onMouseDown={(e) => {
        // Backdrop click cancels; the card stops propagation via its own element.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={cardRef}
        role={isDestructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-lg text-left shadow-lg"
      >
        <h3 id={titleId} className="font-display text-xl font-semibold mb-sm">{title}</h3>
        <p id={messageId} className="text-sm text-muted mb-lg">{message}</p>
        {error && <p className="text-sm text-danger mb-md">{error}</p>}
        <div className="flex justify-end gap-sm">
          {/* Cancel stays enabled while pending so the user is never trapped. */}
          <Button type="button" variant="ghost" onClick={onCancel}>
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
