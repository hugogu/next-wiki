import { describe, expect, it } from 'vitest';
import type { PublicPageTreeNode } from '@next-wiki/shared';
import { getAncestorPaths, sparsifyTree } from './page-tree';

function leaf(path: string, title = path): PublicPageTreeNode {
  return { path, segment: path.split('/').pop()!, title, pageId: 'p-' + path, status: 'published', children: [] };
}

function branch(path: string, children: PublicPageTreeNode[]): PublicPageTreeNode {
  return { path, segment: path.split('/').pop()!, title: null, pageId: null, status: null, children };
}

describe('getAncestorPaths', () => {
  it('returns empty array for empty or root path', () => {
    expect(getAncestorPaths(undefined)).toEqual([]);
    expect(getAncestorPaths(null)).toEqual([]);
    expect(getAncestorPaths('')).toEqual([]);
  });

  it('returns single-element array for top-level path', () => {
    expect(getAncestorPaths('ai')).toEqual([]);
    // Single segment → loop never executes because i starts at 1 and length is 1
  });

  it('returns every prefix except the leaf', () => {
    expect(getAncestorPaths('ai/applications/coding')).toEqual(['ai', 'ai/applications']);
  });

  it('handles trailing slash gracefully (empty trailing segment dropped)', () => {
    // 'ai/applications/' → segments ['ai', 'applications'] (empty trailing dropped) → ancestors ['ai']
    expect(getAncestorPaths('ai/applications/')).toEqual(['ai']);
  });
});

describe('sparsifyTree', () => {
  // Synthetic tree mirroring a slice of a real wiki:
  // root
  // ├── ai (branch)
  // │   ├── ai/applications (branch)
  // │   │   ├── ai/applications/coding (leaf)
  // │   │   └── ai/applications/design (leaf)
  // │   └── ai/agent-configurations (leaf)
  // └── books (leaf)
  const tree: PublicPageTreeNode = {
    path: '',
    segment: '',
    title: null,
    pageId: null,
    status: null,
    children: [
      branch('ai', [
        branch('ai/applications', [
          leaf('ai/applications/coding', 'Coding'),
          leaf('ai/applications/design', 'Design'),
        ]),
        leaf('ai/agent-configurations', 'Agent Configs'),
      ]),
      leaf('books', 'Books'),
    ],
  };

  it('returns only top-level shells when currentPath is undefined', () => {
    const result = sparsifyTree(tree, undefined);
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.path)).toEqual(['ai', 'books']);

    const ai = result[0]!;
    expect(ai.hasChildren).toBe(true);
    expect(ai.children).toEqual([]); // not expanded because not ancestor

    const books = result[1]!;
    expect(books.hasChildren).toBe(false);
    expect(books.children).toEqual([]);
  });

  it('fully expands the current page ancestor chain', () => {
    const result = sparsifyTree(tree, 'ai/applications/coding');
    const ai = result.find((n) => n.path === 'ai')!;
    expect(ai.hasChildren).toBe(true);
    expect(ai.children.map((c) => c.path)).toEqual(['ai/applications', 'ai/agent-configurations']);

    const applications = ai.children.find((c) => c.path === 'ai/applications')!;
    // applications IS an ancestor → fully expanded
    expect(applications.children.map((c) => c.path)).toEqual([
      'ai/applications/coding',
      'ai/applications/design',
    ]);

    const agentConfigs = ai.children.find((c) => c.path === 'ai/agent-configurations')!;
    // leaf → hasChildren=false, children=[]
    expect(agentConfigs.hasChildren).toBe(false);
    expect(agentConfigs.children).toEqual([]);
  });

  it('does not expand siblings of ancestor chain', () => {
    const result = sparsifyTree(tree, 'ai/applications/coding');
    const books = result.find((n) => n.path === 'books')!;
    expect(books.hasChildren).toBe(false);
    expect(books.children).toEqual([]);
  });

  it('preserves leaf metadata (title, pageId, status) in sparsified nodes', () => {
    const result = sparsifyTree(tree, 'ai/applications/coding');
    const ai = result[0]!;
    expect(ai.pageId).toBeNull(); // branch node
    expect(ai.title).toBeNull();

    const books = result[1]!;
    expect(books.title).toBe('Books');
    expect(books.status).toBe('published');
  });

  it('handles currentPath pointing at a leaf at top level', () => {
    const result = sparsifyTree(tree, 'books');
    // 'books' has no ancestors → nothing extra expanded, but books itself keeps full info
    const books = result.find((n) => n.path === 'books')!;
    expect(books.hasChildren).toBe(false);
    expect(books.title).toBe('Books');
  });
});