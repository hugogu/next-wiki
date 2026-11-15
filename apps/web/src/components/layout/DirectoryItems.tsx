import Link from 'next/link';
import type { PublicPageTreeNode } from '@next-wiki/shared';
import { ChevronRightIcon, FileTextIcon, FolderIcon } from '@/components/icons';
import { getDirectoryHref } from '@/lib/navigation';
import { getConfiguredSpaceHref, getSpaceHref, type ReaderSpace } from '@/lib/path';

export function DirectoryItems({ nodes, space, routePrefix, onNavigate, childrenLabel }: {
  nodes: PublicPageTreeNode[];
  space: ReaderSpace;
  routePrefix?: string;
  onNavigate?: () => void;
  childrenLabel: string;
}) {
  return (
    <ul className="space-y-0.5" data-testid="directory-navigation">
      {nodes.map((node) => (
        <li key={node.path} className="flex min-w-0 items-center">
          <Link prefetch
            href={node.pageId
              ? routePrefix ? getConfiguredSpaceHref(routePrefix, node.slug ?? node.path) : getSpaceHref(space, node.slug ?? node.path)
              : getDirectoryHref(space, node.path)}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-xs rounded-md px-sm py-1 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
            title={node.title ?? node.segment}
          >
            {node.pageId ? <FileTextIcon className="h-4 w-4 shrink-0" /> : <FolderIcon className="h-4 w-4 shrink-0" />}
            <span className="truncate">{node.title ?? node.segment}</span>
          </Link>
          {node.pageId && node.hasChildren && (
            <Link prefetch href={getDirectoryHref(space, node.path)} onClick={onNavigate}
              aria-label={`${childrenLabel}: ${node.title ?? node.segment}`}
              className="rounded p-1 text-muted hover:bg-surface-elevated hover:text-foreground">
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
