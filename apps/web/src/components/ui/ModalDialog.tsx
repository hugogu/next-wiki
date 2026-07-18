'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { XIcon } from '@/components/icons';

export function ModalDialog({
  title,
  description,
  children,
  onClose,
  maxWidth = 'max-w-2xl',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Hold the latest onClose so the mount-only effect below never has to list it
  // as a dependency. Re-running that effect on every render (which happens when
  // the parent passes an inline onClose) would re-focus the dialog on every
  // keystroke, stealing focus from the field the user is typing in.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Prefer the first form field. The close button is first in DOM order, so
    // querying for buttons too would land initial focus on it instead of the
    // input the user actually wants to fill in.
    const field = panelRef.current?.querySelector<HTMLElement>('input, select, textarea');
    (field ?? panelRef.current?.querySelector<HTMLElement>('button'))?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`max-h-[90vh] w-full overflow-auto rounded-lg border border-border bg-surface p-lg shadow-lg ${maxWidth}`}
      >
        <div className="mb-md flex items-start justify-between gap-md">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
            {description && <p id={descriptionId} className="mt-xs text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-elevated hover:text-foreground"
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
