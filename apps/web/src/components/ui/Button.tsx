import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'default' | 'icon';
}

export function Button({
  children,
  variant = 'primary',
  size = 'default',
  className = '',
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = {
    default: 'px-md py-sm',
    icon: 'h-10 w-10 shrink-0',
  };
  const variants = {
    primary: 'bg-primary text-primary-text hover:bg-primary/90',
    ghost: 'text-muted hover:text-foreground hover:bg-surface border border-transparent',
    danger: 'bg-danger text-white hover:bg-danger/90',
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
