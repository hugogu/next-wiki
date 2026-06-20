import type { ButtonHTMLAttributes } from 'react';

interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked'> {
  checked: boolean;
}

export function Switch({ checked, className = '', ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? 'border-primary bg-primary'
          : 'border-border bg-surface-elevated'
      } ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`block h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
