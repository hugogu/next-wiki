// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assets = vi.hoisted(() => ({ rows: [] as { id: string; contentType: string }[] }));
const db = vi.hoisted(() => ({
  select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve(assets.rows) }) })),
}));
const siteSettings = vi.hoisted(() => ({ getSiteView: vi.fn() }));

vi.mock('@/server/db', () => ({ db }));
vi.mock('@/server/services/site-settings', () => siteSettings);

import { resolvePageSocialImage, resolveSiteSocialImage, toMetadataImage } from './social-image';

const SITE = 'https://wiki.example';
const PNG = '11111111-1111-1111-1111-111111111111';
const SVG = '22222222-2222-2222-2222-222222222222';
const GONE = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  assets.rows = [
    { id: PNG, contentType: 'image/png' },
    { id: SVG, contentType: 'image/svg+xml' },
  ];
  // Default: the shipped SVG icon, i.e. no site-level fallback available.
  siteSettings.getSiteView.mockResolvedValue({
    iconUrl: '/api/settings/site/icon',
    iconMime: null,
  });
});

describe('resolvePageSocialImage', () => {
  it('returns the first body illustration as an absolute URL with its alt text', async () => {
    const html = `<p><img src="/api/v1/assets/${PNG}/content" alt="A glowing horse"></p>`;

    await expect(resolvePageSocialImage(html, SITE)).resolves.toEqual({
      url: `${SITE}/api/v1/assets/${PNG}/content`,
      alt: 'A glowing horse',
      kind: 'content',
    });
  });

  it('accepts the internal asset URL shape as well', async () => {
    await expect(resolvePageSocialImage(`<img src="/api/assets/${PNG}">`, SITE)).resolves.toMatchObject({
      url: `${SITE}/api/assets/${PNG}`,
      kind: 'content',
    });
  });

  // X and Facebook both reject SVG, so an SVG diagram must not become the card.
  it('skips an SVG asset and picks the next renderable one', async () => {
    const html = `<img src="/api/assets/${SVG}" alt="diagram"><img src="/api/assets/${PNG}" alt="photo">`;

    await expect(resolvePageSocialImage(html, SITE)).resolves.toMatchObject({
      url: `${SITE}/api/assets/${PNG}`,
      alt: 'photo',
    });
  });

  it('skips an asset that is no longer in the database', async () => {
    await expect(resolvePageSocialImage(`<img src="/api/assets/${GONE}">`, SITE)).resolves.toBeNull();
  });

  it('accepts an absolute external image but not an external SVG', async () => {
    await expect(
      resolvePageSocialImage('<img src="https://cdn.example/a.svg"><img src="https://cdn.example/b.jpg">', SITE),
    ).resolves.toMatchObject({ url: 'https://cdn.example/b.jpg', kind: 'content' });
  });

  it('ignores a relative non-asset path, whose format cannot be verified', async () => {
    await expect(resolvePageSocialImage('<img src="/uploads/mystery">', SITE)).resolves.toBeNull();
  });

  it('does not query the asset table when the body has no images', async () => {
    await expect(resolvePageSocialImage('<p>Text only.</p>', SITE)).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('falls back to a raster site icon when the body has no usable image', async () => {
    siteSettings.getSiteView.mockResolvedValue({
      iconUrl: '/api/settings/site/icon',
      iconMime: 'image/png',
    });

    await expect(resolvePageSocialImage('<p>Text only.</p>', SITE)).resolves.toEqual({
      url: `${SITE}/api/settings/site/icon`,
      alt: null,
      kind: 'site',
    });
  });
});

describe('toMetadataImage', () => {
  it('carries the alt text through as og:image:alt', () => {
    expect(toMetadataImage({ url: 'https://x/a.png', alt: 'A horse', kind: 'content' })).toEqual({
      url: 'https://x/a.png',
      alt: 'A horse',
    });
  });

  it('omits the alt key entirely when there is none, rather than emitting an empty one', () => {
    expect(toMetadataImage({ url: 'https://x/a.png', alt: null, kind: 'site' })).toEqual({
      url: 'https://x/a.png',
    });
  });
});

describe('resolveSiteSocialImage', () => {
  it('returns nothing for the shipped SVG icon', async () => {
    await expect(resolveSiteSocialImage(SITE)).resolves.toBeNull();
  });

  it('returns nothing for an ICO icon, which crawlers do not render', async () => {
    siteSettings.getSiteView.mockResolvedValue({
      iconUrl: '/api/settings/site/icon',
      iconMime: 'image/x-icon',
    });

    await expect(resolveSiteSocialImage(SITE)).resolves.toBeNull();
  });

  it('returns the icon as a site-kind image when it is a raster upload', async () => {
    siteSettings.getSiteView.mockResolvedValue({
      iconUrl: '/api/settings/site/icon',
      iconMime: 'image/png',
    });

    await expect(resolveSiteSocialImage(SITE)).resolves.toEqual({
      url: `${SITE}/api/settings/site/icon`,
      alt: null,
      kind: 'site',
    });
  });
});
