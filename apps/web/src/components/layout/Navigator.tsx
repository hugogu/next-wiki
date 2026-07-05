'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PageSummary } from '@next-wiki/shared';
import { ChevronRightIcon, FileTextIcon, FolderIcon, XIcon, UsersIcon, ClipboardListIcon, UserIcon, LockIcon, KeyIcon, DatabaseIcon, ArrowUpDownIcon, SettingsIcon, SlidersIcon, EyeIcon, SparklesIcon } from '@/components/icons';
import { getPageHref, leafTitleFromPath } from '@/lib/path';
import { useTranslation } from '@/i18n/client';

const NAV_SCROLL_KEY = 'nav-scroll-top';

/** Folder paths on the way to the active page, so its branch starts expanded. */
function ancestorPaths(currentPath?: string): string[] {
  if (!currentPath) return [];
  const segments = currentPath.split('/');
  const paths: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    paths.push(segments.slice(0, i).join('/'));
  }
  return paths;
}

type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type TreeNode = {
  name: string;
  path: string;
  page?: PageSummary;
  children: TreeNode[];
};

function buildPageTree(pages: PageSummary[]): TreeNode[] {
const root: TreeNode = { name: '', path: '', children: [] };

for (const page of pages) {
  const segments = page.path.split('/');
  let current = root;
  let builtPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    builtPath = builtPath ? `${builtPath}/${segment}` : segment;

  const existing = current.children.find((c) => c.name === segment);
    if (existing) {
      current = existing;
    } else {
      const created: TreeNode = { name: segment, path: builtPath, children: [] };
  current.children.push(created);
current = created;
}
}

current.page = page;
  }

return root.children;
}

function TreeItem({
  node,
  currentPath,
  depth,
  onNavigate,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  currentPath?: string;
  depth: number;
  onNavigate: () => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const active = node.page && node.page.path === currentPath;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.path);
  const indent = { paddingLeft: `${depth * 0.6 + 0.25}rem` };

  return (
    <li>
      {node.page ? (
        <Link
          href={getPageHref(node.page.path)}
          onClick={onNavigate}
          className={`flex items-center gap-xs rounded-md px-sm py-1 text-sm min-w-0 transition-colors ${
            active
              ? 'bg-surface-elevated text-foreground font-medium'
              : 'text-muted hover:text-foreground hover:bg-surface-elevated'
          }`}
          style={indent}
          title={node.page.title}
        >
          <FileTextIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{node.page.title || leafTitleFromPath(node.path)}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-xs rounded-md px-sm py-1 text-sm text-muted min-w-0 transition-colors hover:text-foreground hover:bg-surface-elevated"
          style={indent}
          aria-expanded={isOpen}
          title={node.name}
        >
          <ChevronRightIcon className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          <FolderIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
      )}

      {hasChildren && isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              currentPath={currentPath}
              depth={depth + 1}
              onNavigate={onNavigate}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Navigator({
  pages,
  admin,
  userCenter,
  currentPath,
  isOpen,
  onClose,
}: {
  pages: PageSummary[];
  admin?: boolean;
  userCenter?: boolean;
  currentPath?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const ADMIN_ITEMS: AdminNavItem[] = [
    { href: '/admin/users', label: t('admin.nav.users'), icon: <UsersIcon className="shrink-0" /> },
    { href: '/admin/pages', label: t('admin.nav.pages'), icon: <FileTextIcon className="shrink-0" /> },
    { href: '/admin/ai', label: t('admin.nav.ai'), icon: <SettingsIcon className="shrink-0" /> },
    { href: '/admin/storage', label: t('admin.nav.storage'), icon: <DatabaseIcon className="shrink-0" /> },
    { href: '/admin/transfers', label: t('admin.nav.transfers'), icon: <ArrowUpDownIcon className="shrink-0" /> },
    { href: '/admin/api-audit', label: t('admin.nav.apiAudit'), icon: <ClipboardListIcon className="shrink-0" /> },
    { href: '/admin/appearance', label: t('admin.nav.appearance'), icon: <SlidersIcon className="shrink-0" /> },
  ];
  const USER_CENTER_ITEMS: AdminNavItem[] = [
    { href: '/user-center/profile', label: t('userCenter.nav.profile'), icon: <UserIcon className="shrink-0" /> },
    { href: '/user-center/password', label: t('userCenter.nav.password'), icon: <LockIcon className="shrink-0" /> },
    { href: '/user-center/api-keys', label: t('userCenter.nav.apiKeys'), icon: <KeyIcon className="shrink-0" /> },
    { href: '/user-center/reading-theme', label: t('userCenter.nav.readingTheme'), icon: <EyeIcon className="shrink-0" /> },
    { href: '/user-center/ai-sessions', label: t('userCenter.nav.aiSessions'), icon: <SparklesIcon className="shrink-0" /> },
    { href: '/user-center/audit', label: t('userCenter.nav.audit'), icon: <ClipboardListIcon className="shrink-0" /> },
  ];
  const tree = buildPageTree(pages);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorPaths(currentPath)));
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // Keep the page-tree scroll position across navigations (the nav remounts on
  // each page load, which would otherwise jump it back to the top).
  const scrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(NAV_SCROLL_KEY);
    if (saved) el.scrollTop = Number(saved);
  }, []);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

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
          <span className="font-display font-semibold text-lg">{admin ? t('layout.nav.adminTitle') : userCenter ? t('userCenter.title') : t('layout.nav.pagesTitle')}</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label={t('layout.nav.closeButton')}
          >
            <XIcon />
          </button>
        </div>

        <nav
          ref={scrollRef}
          onScroll={(event) => sessionStorage.setItem(NAV_SCROLL_KEY, String(event.currentTarget.scrollTop))}
          className="flex-1 overflow-y-auto p-sm"
        >
          {userCenter ? (
            <ul className="space-y-xs">
              {USER_CENTER_ITEMS.map((item) => {
                const active = pathname === item.href || (item.href === '/admin/ai' && pathname.startsWith('/admin/ai/'));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-sm px-md py-sm rounded-md text-sm transition-colors ${
                        active
                          ? 'bg-primary text-primary-text'
                          : 'text-muted hover:text-foreground hover:bg-surface-elevated'
                      }`}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : admin ? (
            <ul className="space-y-xs">
              {ADMIN_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-sm px-md py-sm rounded-md text-sm transition-colors ${
                        active
                          ? 'bg-primary text-primary-text'
                          : 'text-muted hover:text-foreground hover:bg-surface-elevated'
                      }`}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : pages.length === 0 ? (
            <p className="text-sm text-muted p-md">{t('layout.nav.empty')}</p>
          ) : (
            <ul className="space-y-0.5">
              {tree.map((node) => (
                <TreeItem
                  key={node.path}
                  node={node}
                  currentPath={currentPath}
                  depth={0}
                  onNavigate={onClose}
                  expanded={expanded}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}
        </nav>
      </aside>
    </>
  );
}
