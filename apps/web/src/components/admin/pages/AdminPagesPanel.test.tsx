import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPageListItem, AdminPageListResult } from '@next-wiki/shared';
import type { TranslateFunction, TranslationKey } from '@/i18n/types';
import { AdminPagesPanel } from './AdminPagesPanel';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('./AdminPageStats', () => ({ AdminPageStats: () => null }));
vi.mock('@/components/ui/Pagination', () => ({ Pagination: () => null }));
vi.mock('./MovePageButton', () => ({ MovePageButton: () => <button data-testid="move-page-button">move</button> }));
vi.mock('./DeletePageButton', () => ({ DeletePageButton: () => null }));
vi.mock('@/components/pages/EditableTagList', () => ({ EditableTagList: () => null }));

const t = ((key: TranslationKey) => key) as TranslateFunction;

function renderSort(direction: 'asc' | 'desc'): string {
  const list: AdminPageListResult = {
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    pageSize: 30,
    sort: 'updatedAt',
    direction,
    filters: {},
  };

  return renderToStaticMarkup(<AdminPagesPanel t={t} list={list} query={{}} />);
}

describe('AdminPagesPanel sorting', () => {
  it('uses a downward arrow instead of the visible desc label', () => {
    const html = renderSort('desc');

    expect(html).toContain('admin.pages.table.updatedAt');
    expect(html).not.toContain('admin.pages.table.updatedAt (desc)');
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('rotate-180');
  });

  it('rotates the arrow and exposes ascending sort semantics', () => {
    const html = renderSort('asc');

    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('rotate-180');
  });
});

function nativePage(overrides: Partial<AdminPageListItem> = {}): AdminPageListItem {
  return {
    id: 'page-1',
    path: 'conversations/feishu/2026/07/21/action-1',
    title: 'Conversation: hi',
    status: 'published',
    authorDisplayName: 'Bot',
    authorEmail: 'bot@example.com',
    editCount: 1,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    tags: [],
    spaceSlug: 'raw',
    kind: 'native',
    nature: 'original',
    ...overrides,
  };
}

describe('AdminPagesPanel space filter (Raw space)', () => {
  it('offers a Raw tab alongside Wiki and Generated when moveEnabled', () => {
    const list: AdminPageListResult = {
      items: [], totalItems: 0, currentPage: 1, totalPages: 1, pageSize: 30,
      sort: 'updatedAt', direction: 'desc', filters: {},
    };
    const html = renderToStaticMarkup(<AdminPagesPanel t={t} list={list} query={{}} moveEnabled />);
    expect(html).toContain('admin.pages.spaces.wiki');
    expect(html).toContain('admin.pages.spaces.generated');
    expect(html).toContain('admin.pages.spaces.raw');
    expect(html).toContain('space=raw');
  });

  it('hides the Move action for native pages while viewing the Raw space (Raw is append-only, never a move target)', () => {
    const list: AdminPageListResult = {
      items: [nativePage()], totalItems: 1, currentPage: 1, totalPages: 1, pageSize: 30,
      sort: 'updatedAt', direction: 'desc', filters: { space: 'raw' },
    };
    const html = renderToStaticMarkup(<AdminPagesPanel t={t} list={list} query={{ space: 'raw' }} moveEnabled />);
    expect(html).not.toContain('data-testid="move-page-button"');
  });

  it('still shows Move for a native page in the Wiki/Generated tabs', () => {
    const list: AdminPageListResult = {
      items: [nativePage({ spaceSlug: 'generated' })], totalItems: 1, currentPage: 1, totalPages: 1, pageSize: 30,
      sort: 'updatedAt', direction: 'desc', filters: { space: 'generated' },
    };
    const html = renderToStaticMarkup(<AdminPagesPanel t={t} list={list} query={{ space: 'generated' }} moveEnabled />);
    expect(html).toContain('data-testid="move-page-button"');
  });
});
