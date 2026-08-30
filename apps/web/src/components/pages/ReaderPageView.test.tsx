import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LivePage } from '@next-wiki/shared';
import type { SpaceRow } from '@/server/services/spaces';

const publicContent = vi.hoisted(() => ({
  getCachedPublishedPageTree: vi.fn(),
  getPageTree: vi.fn(),
  getRevision: vi.fn(),
}));

vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('@/components/ui/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/renderer/ContentRenderer', () => ({ ContentRenderer: () => null }));
vi.mock('@/components/page/AttachmentsPanel', () => ({ AttachmentsPanel: () => null }));
vi.mock('@/components/pages/PageMetadata', () => ({ PageMetadata: () => null }));
vi.mock('@/components/pages/PageSidebar', () => ({ PageSidebar: () => null }));
vi.mock('@/components/pages/ShareButton', () => ({ ShareButton: () => null }));
vi.mock('@/components/pages/ProvenanceIndicators', () => ({ ProvenanceIndicators: () => null }));
vi.mock('@/lib/html', () => ({ extractHeadings: () => [], injectHeadingIds: (html: string) => html }));
vi.mock('@/lib/seo', () => ({ buildPageDescription: () => '' }));
vi.mock('@/server/services/space-routes', () => ({ canonicalSpacePath: () => '/raw' }));
vi.mock('@/server/services/pages', () => ({
  getCachedPublishedTranslationLocales: vi.fn(),
  getReadablePublishedTranslationLocales: vi.fn(),
}));
vi.mock('@/server/services/public-content', () => publicContent);
vi.mock('@/server/permissions', () => ({ can: () => false, pagePermissionOptions: () => ({}) }));
vi.mock('@/i18n/server', () => ({
  getDictionary: () => (key: string, values?: Record<string, string>) => {
    if (key === 'page.read.createdOn') return `Created ${values?.date}`;
    if (key === 'page.read.authorSuffix') return ` by ${values?.name}`;
    if (key === 'common.unknownAuthor') return 'Unknown';
    return key;
  },
}));
vi.mock('@/i18n/formatter', () => ({
  createAppFormatter: () => ({ dateTime: (date: Date, format: string) => `${format}:${date.toISOString()}` }),
}));
vi.mock('@/server/config', () => ({ env: { APP_URL: 'https://wiki.example' } }));
vi.mock('@/lib/page-tree', () => ({ getBreadcrumbNodes: () => [] }));

import { ReaderPageView } from './ReaderPageView';

const rawSpace = { id: 'raw-space', slug: 'raw', kind: 'raw', routePrefix: 'raw', name: 'Raw' } as unknown as SpaceRow;
const page: LivePage = {
  pageId: 'page-1',
  revisionId: 'revision-1',
  path: 'agent/conversation',
  slug: 'agent-conversation',
  title: 'Agent conversation',
  contentHtml: '<p>Conversation</p>',
  contentHash: 'hash',
  version: 3,
  publishedAt: '2026-08-29T06:00:00.000Z',
  authorDisplayName: null,
  authorId: 'owner-1',
  visibility: 'restricted',
  status: 'published',
  createdAt: '2026-08-29T06:00:00.000Z',
  metadata: { date: null, summary: null, tags: [] },
};

describe('ReaderPageView Raw footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicContent.getCachedPublishedPageTree.mockResolvedValue({ root: {} });
    publicContent.getPageTree.mockResolvedValue({ root: {} });
    publicContent.getRevision.mockResolvedValue({
      createdAt: '2026-08-29T06:47:59.000Z',
      source: { apiKeyName: 'OpenClaw mirror' },
    });
  });

  it('shows the current raw revision timestamp to seconds and its admin-visible source', async () => {
    const html = renderToStaticMarkup(await ReaderPageView({
      actor: { kind: 'user', userId: 'admin-1', role: 'admin' },
      locale: 'en',
      resolved: { kind: 'original', page, sourcePath: page.slug, space: rawSpace, legacy: false },
      staticPublic: false,
    }));

    expect(publicContent.getRevision).toHaveBeenCalledWith(
      { actor: { kind: 'user', userId: 'admin-1', role: 'admin' } },
      'page-1',
      3,
    );
    expect(html).toContain('Created shortWithSeconds:2026-08-29T06:47:59.000Z by OpenClaw mirror');
  });
});
