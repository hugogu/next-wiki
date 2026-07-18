// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/astronomy/supernovae' }));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./NavFooterMenu', () => ({ NavFooterMenu: () => null }));

import { Navigator } from './Navigator';
import type { LazyPublicPageTreeNode } from '@/lib/page-tree';

describe('Navigator hybrid node (page that also has children)', () => {
  it('renders both the page link and an expand control, and shows its children', () => {
    // `astronomy` is a page (has pageId) AND nests sub-pages — e.g. an imported
    // Wiki.js section index. Previously it rendered as a bare link with no way
    // to expand, hiding the whole subtree.
    const tree: LazyPublicPageTreeNode[] = [
      {
        path: 'astronomy',
        segment: 'astronomy',
        title: 'Astronomy',
        pageId: 'pg-astro',
        status: 'published',
        hasChildren: true,
        children: [
          {
            path: 'astronomy/supernovae',
            segment: 'supernovae',
            title: 'Supernovae',
            pageId: 'pg-sn',
            status: 'published',
            hasChildren: false,
            children: [],
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      <Navigator
        tree={tree}
        currentPath="astronomy/supernovae"
        isOpen={false}
        onClose={() => {}}
        user={{ kind: 'anonymous' }}
      />,
    );

    // The hybrid node still links to its own page...
    expect(html).toContain('href="/astronomy"');
    // ...and now carries an expand chevron (open, because the active page is a
    // descendant) so the subtree is reachable.
    expect(html).toContain('aria-expanded="true"');
    // The child page renders under it.
    expect(html).toContain('href="/astronomy/supernovae"');
    expect(html).toContain('Supernovae');
  });
});
