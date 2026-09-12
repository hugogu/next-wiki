import { beforeEach, describe, expect, it, vi } from 'vitest';

const pages = vi.hoisted(() => ({ getPublishedForShare: vi.fn() }));
vi.mock('@/server/services/pages', () => pages);
vi.mock('@/server/config', () => ({ env: { APP_URL: 'https://wiki.example/' } }));
vi.mock('@/server/services/site-settings', () => ({ getSiteName: async () => 'Wiki' }));
vi.mock('@/server/services/social-image', () => ({ resolvePageSocialImage: async () => null }));
vi.mock('@/i18n/server', () => ({ getLocale: async () => 'en', getDictionary: () => () => 'Wiki description' }));
vi.mock('@/components/renderer/ContentRenderer', () => ({ ContentRenderer: () => null }));
vi.mock('@/components/pages/ShareButton', () => ({ ShareButton: () => null }));
vi.mock('@/components/pages/PageMetadata', () => ({ PageMetadata: () => null }));
vi.mock('@/components/pages/TagList', () => ({ TagList: () => null }));

import { generateMetadata } from './page';

describe('share metadata', () => {
  beforeEach(() => { pages.getPublishedForShare.mockReset(); });

  it('uses the actual space canonical address while keeping the share URL for previews', async () => {
    pages.getPublishedForShare.mockResolvedValue({
      title: 'SEO audit', contentHtml: '<p>Audit findings</p>', slug: 'seo-audit',
      canonicalPath: '/generated/seo-audit',
    });
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'page-id' }) });
    expect(metadata.alternates?.canonical).toBe('https://wiki.example/generated/seo-audit');
    expect(metadata.openGraph?.url).toBe('https://wiki.example/s/page-id');
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('does not expose metadata for an unavailable share', async () => {
    pages.getPublishedForShare.mockResolvedValue(null);
    expect(await generateMetadata({ params: Promise.resolve({ id: 'missing-id' }) })).toEqual({
      title: 'Not found', robots: { index: false, follow: false },
    });
  });
});
