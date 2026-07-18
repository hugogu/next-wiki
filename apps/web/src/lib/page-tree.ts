import type { PublicPageTreeNode } from '@next-wiki/shared';

/**
 * Public-page tree node marked with a `hasChildren` flag so the client can
 * tell the difference between "this branch has no children" and "we did not
 * ship the children because we want lazy loading". Children are only filled
 * in for nodes that lie on the current page's ancestor chain; everything else
 * starts empty and is fetched on demand via `/api/v1/tree?pathPrefix=`.
 */
export type LazyPublicPageTreeNode = Omit<PublicPageTreeNode, 'children'> & {
  hasChildren: boolean;
  children: LazyPublicPageTreeNode[];
};

/**
 * Walks a path like "ai/applications/coding" and returns every prefix except
 * the leaf itself: ["ai", "ai/applications"]. Used to identify which tree
 * nodes the server should pre-expand so the current page is visible in the
 * sidebar without an extra round-trip.
 */
export function getAncestorPaths(path: string | undefined | null): string[] {
  if (!path) return [];
  const segments = path.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i).join('/'));
  }
  return ancestors;
}

/**
 * Returns true when `path` equals one of the precomputed ancestor paths.
 * Cheap lookup against a small array (≤ page depth, typically ≤ 5).
 */
function isAncestor(path: string, ancestorSet: ReadonlySet<string>): boolean {
  return ancestorSet.has(path);
}

/**
 * Reduce a fully-resolved public page tree to just the data the sidebar
 * needs for first paint: top-level nodes plus the full subtree of every
 * node that lies on the current page's ancestor chain. Other branches are
 * kept as `LazyPublicPageTreeNode` shells with `hasChildren` set so the
 * client can render the expand chevron and lazy-load children on demand.
 */
export function sparsifyTree(
  root: PublicPageTreeNode,
  currentPath: string | undefined | null,
): LazyPublicPageTreeNode[] {
  const ancestorSet = new Set(getAncestorPaths(currentPath));

  function sparsify(node: PublicPageTreeNode, forceFull: boolean): LazyPublicPageTreeNode {
    const keepFull = forceFull || isAncestor(node.path, ancestorSet);
    return {
      path: node.path,
      segment: node.segment,
      title: node.title,
      pageId: node.pageId,
      status: node.status,
      kind: node.kind,
      linkTarget: node.linkTarget,
      hasChildren: node.children.length > 0,
      children: keepFull ? node.children.map((c) => sparsify(c, false)) : [],
    };
  }

  return root.children.map((child) => sparsify(child, false));
}
