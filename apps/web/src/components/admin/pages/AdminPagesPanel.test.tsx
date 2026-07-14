import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPageListResult } from '@next-wiki/shared';
import type { TranslateFunction, TranslationKey } from '@/i18n/types';
import { AdminPagesPanel } from './AdminPagesPanel';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('./AdminPageStats', () => ({ AdminPageStats: () => null }));
vi.mock('@/components/ui/Pagination', () => ({ Pagination: () => null }));

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
