'use client';

import { useEffect, useId } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import type { Heading } from '@/lib/html';
import { OUTLINE_STORAGE_KEY, useOutlineStore } from './outline-store';

type OutlineNavProps = {
  headings: Heading[];
  label: string;
  collapseLabel: string;
  expandLabel: string;
};

/**
 * The reader's Outline, with a button in its header that folds the list away.
 * The choice is remembered by the browser (see `outline-store`), so the next
 * page opens the way the reader left this one.
 */
export function OutlineNav({ headings, label, collapseLabel, expandLabel }: OutlineNavProps) {
  const collapsed = useOutlineStore((state) => state.collapsed);
  const setCollapsed = useOutlineStore((state) => state.setCollapsed);
  const listId = useId();
  const toggleLabel = collapsed ? expandLabel : collapseLabel;

  // A choice made in another tab arrives as a storage event; follow it so this
  // page does not disagree with the one the reader just changed.
  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key === OUTLINE_STORAGE_KEY) void useOutlineStore.persist.rehydrate();
    };
    window.addEventListener('storage', follow);
    return () => window.removeEventListener('storage', follow);
  }, []);

  return (
    <nav className="flex flex-col rounded-lg border border-border bg-surface">
      <div className={`flex items-center justify-between gap-sm p-sm ${collapsed ? '' : 'border-b border-border'}`}>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <ul id={listId} hidden={collapsed} className="p-sm">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className="block rounded-md px-sm py-1 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              style={{ paddingLeft: `${(heading.level - 2) * 0.75 + 0.5}rem` }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
