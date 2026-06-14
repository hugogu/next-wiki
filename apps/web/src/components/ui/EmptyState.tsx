import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-xl text-muted border border-dashed border-border rounded-lg">
      <h2 className="text-lg font-medium text-foreground mb-sm">{title}</h2>
      {children}
    </div>
  );
}

export function ErrorState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-xl text-danger border border-danger/20 rounded-lg bg-danger/5">
      <h2 className="text-lg font-medium mb-sm">{title}</h2>
      {children}
    </div>
  );
}
