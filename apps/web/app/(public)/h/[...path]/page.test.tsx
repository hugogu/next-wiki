import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pages = vi.hoisted(() => ({
  getLive: vi.fn(),
  canCreate: vi.fn(),
  getHistory: vi.fn(),
  getRevision: vi.fn(),
}));
const selector = vi.hoisted(() => vi.fn());

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
  HistoryRevisionSelector: (props: { space?: string }) => {
    selector(props);
    return <div data-testid="revision-selector" data-space={props.space} />;
  },
}));

import HistoryPage from './page';

const frontmatterSource = '---\ntitle: T\n---\n\nbody 3';

function summary(version: number) {
  return {
    version,
    status: 'published',
    canPublish: false,
    canDelete: false,
    createdAt: new Date('2026-07-23T00:00:00Z'),
    authorDisplayName: 'Admin',
  };
}

function revisionView(version: number) {
  return {
    version,
    status: 'published',
    contentSource: version === 3 ? frontmatterSource : `body ${version}`,
    contentHtml: `<p>${version}</p>`,
    authorDisplayName: 'Admin',
    createdAt: '2026-07-23T00:00:00.000Z',
  };
}

async function renderHistory(searchParams: Record<string, string> = {}) {
  const element = await HistoryPage({
    params: Promise.resolve({ path: ['docs', 'a'] }),
    searchParams: Promise.resolve(searchParams),
  });
  renderToStaticMarkup(element);
  return selector.mock.calls.at(-1)![0] as {
    pageId: string;
    currentVersion: number;
    initialSelection: number[];
    initialRevisions: unknown[];
    initialOptions: unknown;
  };
}

describe('Generated page history navigation', () => {
  beforeEach(() => {
    pages.getLive.mockReset();
    pages.canCreate.mockReset();
    pages.getHistory.mockReset();
    pages.getRevision.mockReset();
    selector.mockReset();
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

    expect(html).toContain('href="/generated/zhuge-liang"');
    expect(html).toContain('data-layout-space="generated"');
    expect(html).toContain('data-page-space="generated"');
    expect(html).toContain('data-space="generated"');
  });
});

describe('History page first view', () => {
  beforeEach(() => {
    pages.getLive.mockReset();
    pages.canCreate.mockReset();
    pages.getHistory.mockReset();
    pages.getRevision.mockReset();
    selector.mockReset();
    pages.getLive.mockResolvedValue({ pageId: 'page-1', title: 'T', status: 'published', version: 3 });
    pages.canCreate.mockResolvedValue(true);
    pages.getHistory.mockResolvedValue([summary(3), summary(2), summary(1)]);
    pages.getRevision.mockImplementation(async (_ctx: unknown, _path: string, version: number) => revisionView(version));
  });

  it('opens on the two newest revisions and sends only their content', async () => {
    const props = await renderHistory();

    expect(props.pageId).toBe('page-1');
    expect(props.currentVersion).toBe(3);
    expect(props.initialSelection).toEqual([2, 3]);
    expect(props.initialRevisions).toEqual([
      { version: 2, contentSource: 'body 2', contentHtml: '<p>2</p>', previewLineOffset: 0 },
      { version: 3, contentSource: frontmatterSource, contentHtml: '<p>3</p>', previewLineOffset: 4 },
    ]);
    expect(pages.getRevision).toHaveBeenCalledTimes(2);
  });

  it('opens the comparison the URL names, with its display options', async () => {
    const props = await renderHistory({ compare: '1..2', view: 'preview', context: '5', ignoreWhitespace: '1', sync: '0' });

    expect(props.initialSelection).toEqual([1, 2]);
    expect(props.initialOptions).toEqual({ view: 'preview', context: 5, ignoreWhitespace: true, sync: false });
    expect(props.initialRevisions).toHaveLength(2);
  });

  it('opens one selected revision and loads only that one', async () => {
    const props = await renderHistory({ selected: '2' });

    expect(props.initialSelection).toEqual([2]);
    expect(props.initialRevisions).toEqual([
      { version: 2, contentSource: 'body 2', contentHtml: '<p>2</p>', previewLineOffset: 0 },
    ]);
    expect(pages.getRevision).toHaveBeenCalledTimes(1);
  });

  it('starts empty when there is a single revision and nothing to compare', async () => {
    pages.getHistory.mockResolvedValue([summary(1)]);

    const props = await renderHistory();

    expect(props.initialSelection).toEqual([]);
    expect(props.initialRevisions).toEqual([]);
  });

  it('redirects a reversed comparison to its ordered form, keeping the other parameters', async () => {
    await expect(renderHistory({ compare: '3..1', space: 'raw', view: 'preview' })).rejects.toThrow(
      'redirect:/h/docs/a?compare=1..3&space=raw&view=preview',
    );
  });

  it('answers 404 for a comparison naming a revision the visitor cannot see', async () => {
    await expect(renderHistory({ compare: '1..9' })).rejects.toThrow('not found');
  });
});
