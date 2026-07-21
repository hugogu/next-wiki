// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const auth = vi.hoisted(() => ({ getCurrentActor: vi.fn(async () => ({ kind: 'anonymous' as const })) }));
const userCenter = vi.hoisted(() => ({ getPreferences: vi.fn() }));
const systemTheme = vi.hoisted(() => ({ getActiveThemeCss: vi.fn(async () => '') }));
const analytics = vi.hoisted(() => ({ getActiveAnalyticsScriptContent: vi.fn(async () => '') }));
const userAppearance = vi.hoisted(() => ({ getUserAppearance: vi.fn() }));
const i18nServer = vi.hoisted(() => ({
  getLocale: vi.fn(async () => 'en'),
  getDictionary: vi.fn(() => (key: string) => key),
}));

vi.mock('@/server/services/auth', () => auth);
vi.mock('@/server/services/user-center', () => userCenter);
vi.mock('@/server/services/system-theme', () => systemTheme);
vi.mock('@/server/services/analytics', () => analytics);
vi.mock('@/server/services/user-appearance', () => userAppearance);
vi.mock('@/i18n/server', () => i18nServer);
// HistoryProvider (mounted by RootLayout) calls next/navigation's router
// hooks, which require an App Router context that renderToStaticMarkup
// does not provide.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import RootLayout from './layout';

describe('RootLayout analytics injection', () => {
  it('renders no analytics <script> when no providers are enabled', async () => {
    analytics.getActiveAnalyticsScriptContent.mockResolvedValueOnce('');
    const html = renderToStaticMarkup(await RootLayout({ children: <div>content</div> }));
    expect(html).not.toContain('id="app-analytics"');
  });

  it('inlines the active script content inside <script id="app-analytics"> when a provider is enabled', async () => {
    const content = 'try {\nvar _hmt = _hmt || [];\n} catch (e) {\n  console.error(e);\n}';
    analytics.getActiveAnalyticsScriptContent.mockResolvedValueOnce(content);
    const html = renderToStaticMarkup(await RootLayout({ children: <div>content</div> }));
    expect(html).toContain('id="app-analytics"');
    expect(analytics.getActiveAnalyticsScriptContent).toHaveBeenCalled();
  });

  it('reads the active script content with no session/locale-derived arguments (US3 - identical for every visitor)', async () => {
    analytics.getActiveAnalyticsScriptContent.mockResolvedValueOnce('');
    await RootLayout({ children: <div>content</div> });
    expect(analytics.getActiveAnalyticsScriptContent).toHaveBeenCalledWith();
  });
});
