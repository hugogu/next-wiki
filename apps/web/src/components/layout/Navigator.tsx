'use client';

import Link from 'next/link';
import type { PageSummary } from '@next-wiki/shared';
import { FileTextIcon, XIcon, UsersIcon } from '@/components/icons';

type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const ADMIN_ITEMS: AdminNavItem[] = [
  { href: '/admin/users', label: 'Users', icon: <UsersIcon className="shrink-0" /> },
];

export function Navigator({
  pages,
  admin,
  currentSlug,
  isOpen,
  onClose,
}: {
  pages: PageSummary[];
  admin?: boolean;
  currentSlug?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-nav bg-surface border-r border-border
          transform transition-transform duration-200 ease-out
          lg:transform-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
        `}
        style={{ top: 'var(--header-height)' }}
      >
        <div className="flex items-center justify-between p-md border-b border-border lg:hidden">
          <span className="font-display font-semibold text-lg">{admin ? 'Admin' : 'Pages'}</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label="Close navigator"
          >
            <XIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-sm">
          {admin ? (
            <ul className="space-y-xs">
              {ADMIN_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-sm px-md py-sm rounded-md text-sm text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : pages.length === 0 ? (
            <p className="text-sm text-muted p-md">No published pages yet.</p>
          ) : (
            <ul className="space-y-xs">
              {pages.map((page) => {
                const active = page.slug === currentSlug;
                return (
                  <li key={page.slug}>
                    <Link
                      href={`/${page.slug}`}
                      onClick={onClose}
                      className={`
                        flex items-center gap-sm px-md py-sm rounded-md text-sm transition-colors
                        ${active
                          ? 'bg-surface-elevated text-foreground font-medium'
                          : 'text-muted hover:text-foreground hover:bg-surface-elevated'
                        }
                      `}
                    >
                      <FileTextIcon className="shrink-0" />
                      <span className="truncate">{page.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </aside>
    </>
  );
}
