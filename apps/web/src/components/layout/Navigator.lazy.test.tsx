// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { Navigator } from './Navigator';
import type { LazyPublicPageTreeNode } from '@/lib/page-tree';
import type { Actor } from '@/server/permissions';

vi.mock('next/navigation', () => ({
  usePathname: () => '/wiki/guides',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./NavFooterMenu', () => ({ NavFooterMenu: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Navigator lazy branches', () => {
  const tree: LazyPublicPageTreeNode[] = [{
    path: 'guides',
    segment: 'guides',
    title: 'Guides',
    pageId: 'guides',
    slug: 'guides',
    status: 'published',
    hasChildren: true,
    children: [],
  }];
  const draft = {
    path: 'guides/draft',
    segment: 'draft',
    title: 'Draft guide',
    pageId: 'draft',
    slug: 'guides/draft',
    status: 'draft',
    children: [],
  };
  const published = {
    ...draft,
    path: 'guides/published',
    segment: 'published',
    title: 'Published guide',
    pageId: 'published',
    slug: 'guides/published',
    status: 'published',
  };

  it.each<{ user: Actor; seesDraft: boolean }>([
    { user: { kind: 'user', userId: 'editor', role: 'editor' }, seesDraft: true },
    { user: { kind: 'anonymous' }, seesDraft: false },
  ])('loads the right children for a $user.kind', async ({ user, seesDraft }) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const params = new URL(url, 'https://wiki.test').searchParams;
      return Response.json({
        root: { children: params.get('status') === 'all' ? [published, draft] : [published] },
      });
    }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<Navigator tree={tree} isOpen={false} onClose={() => {}} user={user} />);
      });
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="guides"]')!.click();
      });
      expect(container.querySelector('a[href="/guides/published"]')).not.toBeNull();
      expect(Boolean(container.querySelector('a[href="/guides/draft"]'))).toBe(seesDraft);
    } finally {
      act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
