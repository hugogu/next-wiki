import type { ReactNode } from 'react';

export function Tooltip({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex ${className}`} title={label}>
      {children}
    </span>
  );
}
