'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { OUTLINE_BODY_ID, setOutlineCollapsed } from '@/lib/outline-preference';

const COLLAPSE_BUTTON_ID = 'outline-collapse';
const EXPAND_BUTTON_ID = 'outline-expand';

/**
 * One of the two buttons that move the Outline sidebar out of the way, to the
 * right edge of the page, and back. Both are always in the page: the stylesheet
 * shows whichever applies to the saved choice, so what is shown, and what
 * assistive technology is told, is right from the first paint and does not wait
 * for this component to hydrate.
 */
export function OutlineToggle({ collapse, label }: { collapse: boolean; label: string }) {
  const Icon = collapse ? ChevronRightIcon : ChevronLeftIcon;

  return (
    <button
      type="button"
      id={collapse ? COLLAPSE_BUTTON_ID : EXPAND_BUTTON_ID}
      aria-label={label}
      title={label}
      // The collapse button is only ever shown while the sidebar is open, the expand button while it is not.
      aria-expanded={collapse}
      aria-controls={OUTLINE_BODY_ID}
      onClick={() => {
        setOutlineCollapsed(collapse);
        // The button just pressed is no longer shown; keep a keyboard user's place.
        document.getElementById(collapse ? EXPAND_BUTTON_ID : COLLAPSE_BUTTON_ID)?.focus();
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
