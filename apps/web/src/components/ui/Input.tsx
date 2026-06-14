import type { InputHTMLAttributes } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-border bg-surface px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${className}`}
      {...props}
    />
  );
}
