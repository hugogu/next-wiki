// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/astronomy/supernovae' }));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./NavFooterMenu', () => ({ NavFooterMenu: () => null }));

import { Navigator } from './Navigator';
import { navItemActive } from './Navigator';
import type { LazyPublicPageTreeNode } from '@/lib/page-tree';

describe('navItemActive', () => {
  const hrefs = ['/admin/ai', '/admin/ai/tools', '/admin/static-site', '/admin/integrations'];

  it('keeps the section highlighted on its sub-pages', () => {
    expect(navItemActive('/admin/static-site/settings', '/admin/static-site', hrefs)).toBe(true);
    expect(navItemActive('/admin/static-site/history', '/admin/static-site', hrefs)).toBe(true);
    expect(navItemActive('/admin/integrations/github', '/admin/integrations', hrefs)).toBe(true);
  });

  it('lets the longest matching nav item win over its parent', () => {
    expect(navItemActive('/admin/ai/tools', '/admin/ai', hrefs)).toBe(false);
    expect(navItemActive('/admin/ai/tools', '/admin/ai/tools', hrefs)).toBe(true);
    expect(navItemActive('/admin/ai/tools/x', '/admin/ai/tools', hrefs)).toBe(true);
  });

  it('does not treat a shared segment prefix as a sub-page', () => {
    expect(navItemActive('/admin/site2', '/admin/site', hrefs)).toBe(false);
  });
});

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
        slug: 'astronomy',
        status: 'published',
        hasChildren: true,
        children: [
          {
            path: 'astronomy/supernovae',
            segment: 'supernovae',
            title: 'Supernovae',
            pageId: 'pg-sn',
            slug: 'astronomy/supernovae',
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

describe('Navigator LLM Wiki space tabs', () => {
  it('renders persistent title-bar tabs outside the scrolling navigation', () => {
    const html = renderToStaticMarkup(
      <Navigator
        tree={[]}
        isOpen={false}
        onClose={() => {}}
        user={{ kind: 'user', userId: 'admin-1', role: 'admin' }}
        space="generated"
        writingMode="llm-wiki"
      />,
    );

    const tabsStart = html.indexOf('aria-label="layout.nav.spaces.label"');
    const navigationStart = html.indexOf('<nav');
    expect(tabsStart).toBeGreaterThan(-1);
    expect(tabsStart).toBeLessThan(navigationStart);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/spaces/generated"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/spaces/raw"');
  });
});
