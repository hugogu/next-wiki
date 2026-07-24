import type { ReactNode } from 'react';

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  const toneClass = {
    neutral: 'border-border bg-surface-elevated text-muted',
    success: 'border-success/40 bg-success/15 text-success',
    warning: 'border-warning/30 bg-warning-subtle text-warning',
    danger: 'border-danger/30 bg-danger-subtle text-danger',
    info: 'border-primary/30 bg-primary/10 text-primary',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-sm py-0.5 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
