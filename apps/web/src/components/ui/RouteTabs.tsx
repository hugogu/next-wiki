'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type RouteTabItem = {
  href: string;
  label: string;
  /** Marks the tab active for the item's own path and anything under it. */
  exact?: boolean;
};

/** Horizontal tab bar for sibling routes within one admin section. */
export function RouteTabs({ items }: { items: RouteTabItem[] }) {
  const pathname = usePathname();
  return (
    <div role="tablist" className="flex gap-xs border-b border-border">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={active}
            className={`-mb-px border-b-2 px-md py-sm text-sm ${
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
