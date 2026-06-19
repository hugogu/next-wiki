import type { SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '@/components/icons';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
}

export function Select({
  children,
  className = '',
  containerClassName = '',
  ...props
}: SelectProps) {
  return (
    <div className={`relative ${containerClassName}`}>
      <select
        className={`w-full appearance-none rounded-md border border-border bg-surface px-md py-sm pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
