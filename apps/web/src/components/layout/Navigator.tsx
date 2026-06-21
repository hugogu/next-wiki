'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PageSummary } from '@next-wiki/shared';
import { FileTextIcon, FolderIcon, XIcon, UsersIcon, ClipboardListIcon, UserIcon, LockIcon, KeyIcon, DatabaseIcon, SettingsIcon } from '@/components/icons';
import { getPageHref, leafTitleFromPath } from '@/lib/path';
import { useTranslation } from '@/i18n/client';

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
}: {
  node: TreeNode;
  currentPath?: string;
  depth: number;
  onNavigate: () => void;
}) {
  const active = node.page && node.page.path === currentPath;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-sm rounded-md text-sm transition-colors"
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        {node.page ? (
          <Link
            href={getPageHref(node.page.path)}
            onClick={onNavigate}
            className={`
              flex-1 flex items-center gap-sm px-md py-sm rounded-md min-w-0
              ${active
                ? 'bg-surface-elevated text-foreground font-medium'
                : 'text-muted hover:text-foreground hover:bg-surface-elevated'
              }
            `}
            title={node.page.title}
          >
            <FileTextIcon className="shrink-0" />
            <span className="truncate">{node.page.title || leafTitleFromPath(node.path)}</span>
          </Link>
        ) : (
          <span className="flex-1 flex items-center gap-sm px-md py-sm text-muted min-w-0">
            <FolderIcon className="shrink-0" />
            <span className="truncate">{node.name}</span>
          </span>
        )}
      </div>

      {hasChildren && (
        <ul className="mt-xs space-y-xs">
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              currentPath={currentPath}
              depth={depth + 1}
              onNavigate={onNavigate}
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
    { href: '/admin/ai', label: t('admin.nav.ai'), icon: <SettingsIcon className="shrink-0" /> },
    { href: '/admin/storage', label: t('admin.nav.storage'), icon: <DatabaseIcon className="shrink-0" /> },
    { href: '/admin/transfers', label: t('admin.nav.transfers'), icon: <DatabaseIcon className="shrink-0" /> },
    { href: '/admin/api-audit', label: t('admin.nav.apiAudit'), icon: <ClipboardListIcon className="shrink-0" /> },
  ];
  const USER_CENTER_ITEMS: AdminNavItem[] = [
    { href: '/user-center/profile', label: t('userCenter.nav.profile'), icon: <UserIcon className="shrink-0" /> },
    { href: '/user-center/password', label: t('userCenter.nav.password'), icon: <LockIcon className="shrink-0" /> },
    { href: '/user-center/api-keys', label: t('userCenter.nav.apiKeys'), icon: <KeyIcon className="shrink-0" /> },
    { href: '/user-center/audit', label: t('userCenter.nav.audit'), icon: <ClipboardListIcon className="shrink-0" /> },
  ];
  const tree = buildPageTree(pages);

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

        <nav className="flex-1 overflow-y-auto p-sm">
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
            <ul className="space-y-xs">
              {tree.map((node) => (
                <TreeItem
                  key={node.path}
                  node={node}
                  currentPath={currentPath}
                  depth={0}
                  onNavigate={onClose}
                />
              ))}
            </ul>
          )}
        </nav>
      </aside>
    </>
  );
}
