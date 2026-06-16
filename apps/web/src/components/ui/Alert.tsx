import type { ReactNode } from 'react';

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="p-md bg-danger/10 text-danger rounded-md text-sm" role="alert">
      {children}
    </div>
  );
}
