import type { ReactNode } from 'react';

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex" title={label}>
      {children}
    </span>
  );
}
