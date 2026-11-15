import Link from 'next/link';
import type { PublicPageTreeNode } from '@next-wiki/shared';
import type { ReactNode } from 'react';
import type { ReaderSpace } from '@/lib/path';
import { getConfiguredSpaceHref } from '@/lib/path';
import { getDirectoryHref } from '@/lib/navigation';

export function PageBreadcrumbs({ ancestors, space, routePrefix, rootLabel, label, title, indicators }: {
  ancestors: PublicPageTreeNode[];
  space: ReaderSpace;
  routePrefix: string;
  rootLabel: string;
  label: string;
  title?: string;
  indicators?: ReactNode;
}) {
  return (
    <nav aria-label={label} className="mb-lg flex flex-wrap items-center gap-xs text-sm text-muted">
      <Link prefetch className="hover:text-foreground" href={getDirectoryHref(space)}>{rootLabel}</Link>
      {ancestors.map((node) => (
        <span key={node.path} className="flex items-center gap-xs">
          <span aria-hidden="true">/</span>
          <Link prefetch className="hover:text-foreground" href={node.pageId && node.slug
            ? getConfiguredSpaceHref(routePrefix, node.slug)
            : getDirectoryHref(space, node.path)}>{node.title ?? node.segment}</Link>
        </span>
      ))}
      {title && (
        <span className="flex items-center gap-xs">
          <span aria-hidden="true">/</span>
          <span className="text-foreground" aria-current="page">{title}</span>
          {indicators}
        </span>
      )}
    </nav>
  );
}
