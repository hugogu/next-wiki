import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pages = vi.hoisted(() => ({
  getLive: vi.fn(),
  canCreate: vi.fn(),
  getHistory: vi.fn(),
  getRevision: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock('@/server/services/pages', () => pages);
vi.mock('@/server/services/auth', () => ({
  getCurrentActor: vi.fn(async () => ({ kind: 'user', userId: 'admin-1', role: 'admin' })),
}));
vi.mock('@/i18n/server', () => ({
  getStaticLocale: vi.fn(async () => 'en'),
  getDictionary: vi.fn(() => (key: string, values?: Record<string, unknown>) =>
    key === 'page.history.backToPage' ? `Back to ${String(values?.title ?? '')}` : key),
}));
vi.mock('@/i18n/formatter', () => ({
  createAppFormatter: vi.fn(() => ({ dateTime: () => 'date' })),
}));
vi.mock('@/components/ui/Layout', () => ({
  Layout: ({
    children,
    pageContext,
    space,
  }: {
    children: React.ReactNode;
    pageContext?: { space?: string };
    space?: string;
  }) => (
    <div data-layout-space={space} data-page-space={pageContext?.space}>
      {children}
    </div>
  ),
}));
vi.mock('@/components/pages/HistoryRevisionSelector', () => ({
  HistoryRevisionSelector: ({ space }: { space?: string }) => (
    <div data-testid="revision-selector" data-space={space} />
  ),
}));

import HistoryPage from './page';

describe('Generated page history navigation', () => {
  beforeEach(() => {
    pages.getLive.mockReset();
    pages.canCreate.mockReset();
    pages.getHistory.mockReset();
    pages.getRevision.mockReset();
    pages.getLive.mockResolvedValue({
      pageId: 'page-1',
      title: 'Zhuge Liang',
      status: 'published',
      version: 2,
    });
    pages.canCreate.mockResolvedValue(true);
    pages.getHistory.mockResolvedValue([{
      version: 2,
      status: 'published',
      canPublish: false,
      createdAt: new Date('2026-07-23T00:00:00Z'),
      authorDisplayName: 'Admin',
    }]);
  });

  it('keeps the generated space in its back link and child controls', async () => {
    const element = await HistoryPage({
      params: Promise.resolve({ path: ['zhuge-liang'] }),
      searchParams: Promise.resolve({ space: 'generated' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/spaces/generated/zhuge-liang"');
    expect(html).toContain('data-layout-space="generated"');
    expect(html).toContain('data-page-space="generated"');
    expect(html).toContain('data-space="generated"');
  });
});
