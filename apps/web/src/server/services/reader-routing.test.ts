// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pages = vi.hoisted(() => ({
  getCachedPublicLivePage: vi.fn(),
  getCachedPublicLiveTranslation: vi.fn(),
  getLive: vi.fn(),
  getLiveTranslation: vi.fn(),
  getReaderAccessStatus: vi.fn(),
}));
const spaces = vi.hoisted(() => ({ resolveSpace: vi.fn() }));
const routes = vi.hoisted(() => ({ resolveSpacePrefix: vi.fn(), findPageRouteRedirectTarget: vi.fn() }));
const links = vi.hoisted(() => ({ findRetiredLinkTarget: vi.fn() }));

vi.mock('@/server/services/pages', () => pages);
vi.mock('@/server/services/spaces', () => spaces);
vi.mock('@/server/services/space-routes', () => routes);
vi.mock('@/server/services/link-pages', () => links);

import { resolveReaderPage } from './reader-routing';

const wiki = { id: 'space-1', slug: 'default', kind: 'wiki', routePrefix: 'wiki' };

describe('resolveReaderPage access outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routes.resolveSpacePrefix.mockResolvedValue({ space: wiki, isAlias: false });
    routes.findPageRouteRedirectTarget.mockResolvedValue(null);
    links.findRetiredLinkTarget.mockResolvedValue(null);
  });

  it('reports a published registered page as forbidden to an anonymous visitor', async () => {
    pages.getCachedPublicLivePage.mockResolvedValue(null);
    pages.getReaderAccessStatus.mockResolvedValue({ kind: 'forbidden', visibility: 'registered' });

    await expect(resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'members', 'guide']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'registered', legacy: false });
  });

  it('reports a protected translation as forbidden instead of falling through to a 404', async () => {
    pages.getCachedPublicLiveTranslation.mockResolvedValue({ kind: 'forbidden', visibility: 'restricted' });

    await expect(resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'zh', 'members', 'guide']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'restricted', legacy: false });
  });
});
