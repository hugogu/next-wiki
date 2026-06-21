import type { ReactNode } from 'react';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-xs hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-sm py-xs text-xs text-background shadow-md group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}
