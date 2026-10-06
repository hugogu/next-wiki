import type { ReactNode } from 'react';

/**
 * Hover/focus-triggered dropdown anchored to an icon button in the header
 * toolbar. The outer padding preserves the visual gap without creating a gap in
 * the hover target, so the menu stays open while the pointer moves down.
 */
export function ToolbarMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {icon}
      </button>
      <div className="invisible absolute right-0 top-full z-30 min-w-[12rem] pt-xs pointer-events-none opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        <div className="rounded-md border border-border bg-surface p-xs shadow-lg">{children}</div>
      </div>
    </div>
  );
}
