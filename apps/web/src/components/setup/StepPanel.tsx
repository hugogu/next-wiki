import type { ReactNode } from 'react';

/** Consistent card wrapper for every onboarding step: title, description,
 * and content share one visual rhythm across the wizard. */
export function StepPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-lg">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-xs text-sm text-muted">{description}</p>}
      <div className="mt-lg">{children}</div>
    </section>
  );
}
