import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { Header } from './Header';

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({}) }));
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
    expect(html).toContain('title="View history"');
  });
});
