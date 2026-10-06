import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { Header } from './Header';

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/editor/EditorContext', () => ({ useEditor: () => null }));
vi.mock('@/lib/history', () => ({ useHistory: () => ({ goBack: vi.fn() }) }));
vi.mock('@/components/search/HeaderHybridSearch', () => ({ HeaderHybridSearch: () => null }));

describe('Header localization', () => {
  it('renders the catalog-backed navigation label', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <Header user={{ kind: 'anonymous' }} onMenuClick={() => undefined} siteName="next-wiki" />
      </I18nProvider>,
    );
    expect(html).toContain('next-wiki');
  });

  it('links generated pages to their generated-space history', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <Header
          user={{ kind: 'user', userId: 'user-1', role: 'admin' }}
          pageContext={{
            pageId: 'page-1',
            path: 'history/zhuge-liang',
            title: 'Zhuge Liang',
            status: 'published',
            canEdit: true,
            canPublish: false,
            version: 2,
            space: 'generated',
          }}
          onMenuClick={() => undefined}
          siteName="next-wiki"
        />
      </I18nProvider>,
    );

    expect(html).toContain('href="/h/history/zhuge-liang?space=generated"');
    expect(html).toContain('>View history<');
  });

  it('keeps the visual gap between the actions button and its menu inside the hover target', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <Header
          user={{ kind: 'user', userId: 'user-1', role: 'admin' }}
          pageContext={{
            pageId: 'page-1',
            path: 'history/zhuge-liang',
            title: 'Zhuge Liang',
            status: 'published',
            canEdit: true,
            canPublish: false,
            version: 2,
            space: 'generated',
          }}
          onMenuClick={() => undefined}
          siteName="next-wiki"
        />
      </I18nProvider>,
    );

    expect(html).toContain('top-full z-30 min-w-[12rem] pt-xs');
    expect(html).not.toContain('top-full z-30 mt-xs');
  });

  it('links the language switcher\'s "Original" entry to the reader address, not the tree path (035 T083)', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <Header
          user={{ kind: 'user', userId: 'user-1', role: 'admin' }}
          pageContext={{
            pageId: 'page-1',
            // Tree path differs from the page's public address — a page
            // whose slug has diverged from where it lives in the tree.
            path: 'history/zhuge-liang',
            slug: 'zhuge-liang',
            sourcePath: 'zhuge-liang',
            title: 'Zhuge Liang',
            status: 'published',
            canEdit: true,
            canPublish: false,
            version: 2,
            space: 'wiki',
            translationLocales: ['zh'],
            currentLocale: 'zh',
          }}
          onMenuClick={() => undefined}
          siteName="next-wiki"
        />
      </I18nProvider>,
    );

    expect(html).toContain('href="/zhuge-liang"');
    expect(html).not.toContain('href="/history/zhuge-liang"');
  });

  describe('switching language', () => {
    const render = (translationLocales: string[]) =>
      renderToStaticMarkup(
        <I18nProvider initialLocale="en" messages={enMessages}>
          <Header
            user={{ kind: 'anonymous' }}
            pageContext={{
              pageId: 'page-1',
              path: 'zhuge-liang',
              slug: 'zhuge-liang',
              sourcePath: 'zhuge-liang',
              routePrefix: 'wiki',
              title: 'Zhuge Liang',
              status: 'published',
              canEdit: false,
              canPublish: false,
              version: 1,
              space: 'wiki',
              translationLocales,
              currentLocale: null,
            }}
            onMenuClick={() => undefined}
            siteName="next-wiki"
          />
        </I18nProvider>,
      );

    it('is a button of its own in the toolbar', () => {
      const html = render(['en']);
      expect(html).toContain('aria-label="Language"');
      expect(html).toContain('href="/wiki/zhuge-liang"');
      expect(html).toContain('href="/wiki/en/zhuge-liang"');
    });

    it('is no longer an entry at the end of the actions menu', () => {
      const html = render(['en']);
      expect(html).not.toContain('Other language versions');
      // One way to switch, not two: each version is linked exactly once.
      expect(html.split('href="/wiki/en/zhuge-liang"')).toHaveLength(2);
      expect(html.split('href="/wiki/zhuge-liang"')).toHaveLength(2);
    });

    it('is left out for a page that has no translations', () => {
      expect(render([])).not.toContain('aria-label="Language"');
    });
  });
});
