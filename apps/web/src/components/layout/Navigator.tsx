'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PublicPageTreeNode } from '@next-wiki/shared';
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  XIcon,
  UsersIcon,
  ClipboardListIcon,
  UserIcon,
  LockIcon,
  KeyIcon,
  DatabaseIcon,
  ArrowUpDownIcon,
  SettingsIcon,
  SlidersIcon,
  EyeIcon,
  FeishuIcon,
  BotIcon,
  LanguagesIcon,
  SparklesIcon,
  SearchIcon,
  TagIcon,
  PlusIcon,
} from '@/components/icons';
import { getPageHref, leafTitleFromPath } from '@/lib/path';
import { useTranslation } from '@/i18n/client';
import type { LazyPublicPageTreeNode } from '@/lib/page-tree';
import type { Actor } from '@/server/permissions';
import { NavFooterMenu } from './NavFooterMenu';

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

type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; children: LazyPublicPageTreeNode[] }
  | { status: 'error'; message: string };

/**
 * Recursively attach a `hasChildren` flag to each node based on its nested
 * `children` length. The server-rendered `LazyPublicPageTreeNode` carries the
 * same flag already, but the public tree API returns plain
 * `PublicPageTreeNode` and we need the flag locally to decide whether to
 * render the expand chevron in the sidebar.
 */
function withHasChildrenFlag(nodes: PublicPageTreeNode[]): LazyPublicPageTreeNode[] {
  return nodes.map((node) => ({
    path: node.path,
    segment: node.segment,
    title: node.title,
    pageId: node.pageId,
    status: node.status,
    hasChildren: node.children.length > 0,
    children: withHasChildrenFlag(node.children),
  }));
}

/**
 * Fetch the children of a sidebar branch from the public tree API. Returns
 * the same shape as the server-rendered payload so callers can splice the
 * result into the existing tree without conversion.
 */
async function fetchBranchChildren(pathPrefix: string): Promise<LazyPublicPageTreeNode[]> {
  const params = new URLSearchParams({ pathPrefix });
  const response = await fetch(`/api/v1/tree?${params.toString()}`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`tree fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as { root: PublicPageTreeNode };
  return withHasChildrenFlag(body.root.children);
}

function TreeItem({
  node,
  currentPath,
  depth,
  onNavigate,
  expanded,
  onToggle,
  getLoadState,
  onLoad,
  canCreate,
  addChildLabel,
}: {
  node: LazyPublicPageTreeNode;
  currentPath?: string;
  depth: number;
  onNavigate: () => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  /**
   * Resolves the lazy-load state for any node by path. Each recursion level
   * needs this so nested folders can render their own fetched children,
   * loading spinner, and retry button — not just the top-level nodes.
   */
  getLoadState: (node: LazyPublicPageTreeNode) => LoadState;
  onLoad: (path: string) => void;
  /** Whether to show the per-row "new child page" button (editors/admins). */
  canCreate: boolean;
  addChildLabel: string;
}) {
  const loadState = getLoadState(node);
  const active = node.pageId !== null && node.path === currentPath;
  const isOpen = expanded.has(node.path);
  // Children we can render right now: pre-expanded ones from SSR, or ones
  // the client has loaded lazily. Otherwise `node.children` stays empty.
  const visibleChildren =
    node.children.length > 0 ? node.children : loadState.status === 'ok' ? loadState.children : [];
  const hasVisibleChildren = visibleChildren.length > 0;
  const indent = { paddingLeft: `${depth * 0.6 + 0.25}rem` };

  return (
    <li>
      <div className="group flex items-center" style={indent}>
        {/*
          Leading expand/collapse control. A node may be a page (with a link) and
          still have children — e.g. a Wiki.js section index page that also nests
          sub-pages. Rendering the chevron in its own column, independent of the
          page/folder split below, lets those hybrid nodes be expanded instead of
          hiding their subtree. Pure leaves get a spacer so labels stay aligned.
        */}
        {node.hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            aria-expanded={isOpen}
            aria-label={node.segment}
            className="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-foreground hover:bg-surface-elevated"
          >
            <ChevronRightIcon
              className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="inline-block h-6 w-5 shrink-0" aria-hidden="true" />
        )}
        {node.pageId ? (
          <Link
            href={getPageHref(node.path)}
            onClick={onNavigate}
            className={`flex flex-1 min-w-0 items-center gap-xs rounded-md px-sm py-1 text-sm transition-colors ${
              active
                ? 'bg-surface-elevated text-foreground font-medium'
                : 'text-muted hover:text-foreground hover:bg-surface-elevated'
            }`}
            title={node.title ?? undefined}
          >
            <FileTextIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{node.title || leafTitleFromPath(node.path)}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            className="flex flex-1 min-w-0 items-center gap-xs rounded-md px-sm py-1 text-sm text-muted transition-colors hover:text-foreground hover:bg-surface-elevated"
            aria-expanded={isOpen}
            title={node.segment}
          >
            <FolderIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{node.segment}</span>
          </button>
        )}

        {canCreate && (
          <Link
            href={`/new?prefix=${encodeURIComponent(node.path)}`}
            onClick={onNavigate}
            title={addChildLabel}
            aria-label={addChildLabel}
            // Always visible on touch/mobile; on desktop it reveals on row
            // hover or keyboard focus to keep the tree uncluttered.
            className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-opacity hover:text-foreground hover:bg-surface-elevated focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <PlusIcon className="h-4 w-4" />
          </Link>
        )}
      </div>

      {node.hasChildren && isOpen && (
        <ul>
          {hasVisibleChildren ? (
            visibleChildren.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                currentPath={currentPath}
                depth={depth + 1}
                onNavigate={onNavigate}
                expanded={expanded}
                onToggle={onToggle}
                getLoadState={getLoadState}
                onLoad={onLoad}
                canCreate={canCreate}
                addChildLabel={addChildLabel}
              />
            ))
          ) : loadState.status === 'loading' ? (
            <li style={indent} className="text-xs text-muted py-1" aria-busy="true">
              {`…`}
            </li>
          ) : loadState.status === 'error' ? (
            <li style={indent} className="text-xs text-danger py-1">
              <button
                type="button"
                onClick={() => onLoad(node.path)}
                className="hover:underline"
                title={loadState.message}
              >
                retry
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </li>
  );
}

export function Navigator({
  tree,
  admin,
  userCenter,
  currentPath,
  isOpen,
  onClose,
  user,
}: {
  tree: LazyPublicPageTreeNode[];
  admin?: boolean;
  userCenter?: boolean;
  currentPath?: string;
  isOpen: boolean;
  onClose: () => void;
  user: Actor;
}) {
  const { t } = useTranslation();
  // Editors and admins may create pages, so they get the per-row "new child"
  // button that pre-fills the path prefix from the hovered node.
  const canCreatePages = user.kind === 'user' && (user.role === 'admin' || user.role === 'editor');
  const addChildLabel = t('layout.nav.addChild');
  const pathname = usePathname();
  const ADMIN_GROUPS: AdminNavGroup[] = [
    {
      label: t('admin.nav.groups.content'),
      items: [
        {
          href: '/admin/pages',
          label: t('admin.nav.pages'),
          icon: <FileTextIcon className="shrink-0" />,
        },
        { href: '/admin/tags', label: t('admin.nav.tags'), icon: <TagIcon className="shrink-0" /> },
        {
          href: '/admin/search',
          label: t('admin.nav.search'),
          icon: <SearchIcon className="shrink-0" />,
        },
      ],
    },
    {
      label: t('admin.nav.groups.ai'),
      items: [
        {
          href: '/admin/ai',
          label: t('admin.nav.providers'),
          icon: <SparklesIcon className="shrink-0" />,
        },
        {
          href: '/admin/bots',
          label: t('admin.nav.bots'),
          icon: <BotIcon className="shrink-0" />,
        },
        {
          href: '/admin/translations',
          label: t('admin.nav.translations'),
          icon: <LanguagesIcon className="shrink-0" />,
        },
      ],
    },
    {
      label: t('admin.nav.groups.system'),
      items: [
        {
          href: '/admin/site',
          label: t('admin.nav.site'),
          icon: <SettingsIcon className="shrink-0" />,
        },
        {
          href: '/admin/appearance',
          label: t('admin.nav.appearance'),
          icon: <SlidersIcon className="shrink-0" />,
        },
        {
          href: '/admin/users',
          label: t('admin.nav.users'),
          icon: <UsersIcon className="shrink-0" />,
        },
      ],
    },
    {
      label: t('admin.nav.groups.operations'),
      items: [
        {
          href: '/admin/storage',
          label: t('admin.nav.storage'),
          icon: <DatabaseIcon className="shrink-0" />,
        },
        {
          href: '/admin/transfers',
          label: t('admin.nav.transfers'),
          icon: <ArrowUpDownIcon className="shrink-0" />,
        },
        {
          href: '/admin/api-audit',
          label: t('admin.nav.apiAudit'),
          icon: <ClipboardListIcon className="shrink-0" />,
        },
      ],
    },
  ];
  const USER_CENTER_ITEMS: AdminNavItem[] = [
    {
      href: '/user-center/profile',
      label: t('userCenter.nav.profile'),
      icon: <UserIcon className="shrink-0" />,
    },
    {
      href: '/user-center/password',
      label: t('userCenter.nav.password'),
      icon: <LockIcon className="shrink-0" />,
    },
    {
      href: '/user-center/api-keys',
      label: t('userCenter.nav.apiKeys'),
      icon: <KeyIcon className="shrink-0" />,
    },
    {
      href: '/user-center/reading-theme',
      label: t('userCenter.nav.readingTheme'),
      icon: <EyeIcon className="shrink-0" />,
    },
    {
      href: '/user-center/ai-sessions',
      label: t('userCenter.nav.aiSessions'),
      icon: <SparklesIcon className="shrink-0" />,
    },
    {
      href: '/user-center/feishu',
      label: t('userCenter.nav.feishu'),
      icon: <FeishuIcon className="shrink-0" />,
    },
    {
      href: '/user-center/audit',
      label: t('userCenter.nav.audit'),
      icon: <ClipboardListIcon className="shrink-0" />,
    },
  ];
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorPaths(currentPath)));
  const [branchCache, setBranchCache] = useState<Record<string, LazyPublicPageTreeNode[]>>({});
  const [branchLoad, setBranchLoad] = useState<Record<string, 'loading' | 'error'>>({});
  // Tracks paths we've already kicked off a fetch for in this lifetime so we
  // don't fire duplicate requests when the user double-clicks a chevron.
  const inflight = useRef<Set<string>>(new Set());

  /**
   * Resolve lazy-load state for any tree node by its path. Used at every
   * recursion depth (top-level AND nested folders) so that expanding
   * `ai/applications` after `ai/` was already lazy-loaded correctly shows
   * its own cached children / loading / error state. Stable identity matters
   * here — TreeItem recomputes `loadState` on every render, so we memoise
   * against branchCache + branchLoad + t to avoid pointless re-renders.
   */
  const getLoadState = useCallback(
    (target: LazyPublicPageTreeNode): LoadState => {
      const needsLazy = target.hasChildren && target.children.length === 0;
      if (!needsLazy) return { status: 'idle' };
      const cached = branchCache[target.path];
      if (cached) return { status: 'ok', children: cached };
      if (branchLoad[target.path] === 'loading') return { status: 'loading' };
      if (branchLoad[target.path] === 'error') {
        return { status: 'error', message: t('layout.nav.loadError') };
      }
      return { status: 'idle' };
    },
    [branchCache, branchLoad, t],
  );

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const loadBranch = useCallback(
    (path: string) => {
      if (branchCache[path] || inflight.current.has(path)) return;
      inflight.current.add(path);
      setBranchLoad((prev) => ({ ...prev, [path]: 'loading' }));
      fetchBranchChildren(path)
        .then((children) => {
          setBranchCache((prev) => ({ ...prev, [path]: children }));
          setBranchLoad((prev) => {
            const next = { ...prev };
            delete next[path];
            return next;
          });
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'load failed';
          setBranchLoad((prev) => ({ ...prev, [path]: 'error' }));
          // Surface the underlying message in the console for debugging without
          // breaking the UI; the chevron retry button keeps the sidebar usable.
          console.error('[Navigator] branch load failed', path, message);
        })
        .finally(() => {
          inflight.current.delete(path);
        });
    },
    [branchCache],
  );

  // Whenever a new branch is expanded for the first time, fire a fetch.
  // Collapsing does not drop the cache so re-expanding is instant.
  useEffect(() => {
    function findNode(
      nodes: LazyPublicPageTreeNode[],
      target: string,
    ): LazyPublicPageTreeNode | undefined {
      for (const node of nodes) {
        if (node.path === target) return node;
        const found = findNode(node.children, target);
        if (found) return found;
      }
      return undefined;
    }
    for (const path of expanded) {
      const node = findNode(tree, path);
      if (!node) continue;
      if (
        node.hasChildren &&
        node.children.length === 0 &&
        !branchCache[path] &&
        !branchLoad[path]
      ) {
        loadBranch(path);
      }
    }
  }, [expanded, tree, branchCache, branchLoad, loadBranch]);

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
          <span className="font-display font-semibold text-lg">
            {admin
              ? t('layout.nav.adminTitle')
              : userCenter
                ? t('userCenter.title')
                : t('layout.nav.pagesTitle')}
          </span>
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
          onScroll={(event) =>
            sessionStorage.setItem(NAV_SCROLL_KEY, String(event.currentTarget.scrollTop))
          }
          className="flex-1 overflow-y-auto p-sm"
        >
          {userCenter ? (
            <ul className="space-y-xs">
              {USER_CENTER_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href === '/admin/ai' && pathname.startsWith('/admin/ai/'));
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
            <div className="space-y-md">
              {ADMIN_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-md pb-xs pt-sm text-xs font-medium uppercase tracking-wide text-muted">
                    {group.label}
                  </p>
                  <ul className="space-y-xs">
                    {group.items.map((item) => {
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
                </div>
              ))}
            </div>
          ) : tree.length === 0 ? (
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
                  getLoadState={getLoadState}
                  onLoad={loadBranch}
                  canCreate={canCreatePages}
                  addChildLabel={addChildLabel}
                />
              ))}
            </ul>
          )}
        </nav>

        <NavFooterMenu user={user} onNavigate={onClose} />
      </aside>
    </>
  );
}
