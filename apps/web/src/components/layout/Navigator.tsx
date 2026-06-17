'use client';

import Link from 'next/link';
import type { PageSummary } from '@next-wiki/shared';
import { FileTextIcon, FolderIcon, XIcon, UsersIcon } from '@/components/icons';
import { getPageHref, leafTitleFromPath } from '@/lib/path';

type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const ADMIN_ITEMS: AdminNavItem[] = [
  { href: '/admin/users', label: 'Users', icon: <UsersIcon className="shrink-0" /> },
];

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
  currentPath,
  isOpen,
  onClose,
}: {
  pages: PageSummary[];
  admin?: boolean;
  currentPath?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
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
