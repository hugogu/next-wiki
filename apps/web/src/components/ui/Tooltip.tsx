import type { ReactNode } from 'react';

type TooltipPlacement = 'top' | 'bottom';
type TooltipAlignment = 'start' | 'center' | 'end';

export function tooltipPositionClassName(
  placement: TooltipPlacement,
  align: TooltipAlignment,
): string {
  const placementClass = placement === 'bottom' ? 'top-full mt-xs' : 'bottom-full mb-xs';
  const alignmentClass =
    align === 'start'
      ? 'left-0'
      : align === 'end'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';
  return `${placementClass} ${alignmentClass}`;
}

export function Tooltip({
  label,
  children,
  placement = 'top',
  align = 'center',
}: {
  label: string;
  children: ReactNode;
  placement?: TooltipPlacement;
  align?: TooltipAlignment;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[60] hidden w-max max-w-[min(20rem,calc(100vw-1rem))] whitespace-normal rounded-md bg-foreground px-sm py-xs text-xs text-background shadow-md group-hover:block group-focus-within:block ${tooltipPositionClassName(placement, align)}`}
      >
        {label}
      </span>
    </span>
  );
}
