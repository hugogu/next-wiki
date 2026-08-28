import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { SpaceSettingsPanel, type SpaceSettingsItem } from './SpaceSettingsPanel';

const spaces: SpaceSettingsItem[] = [
  {
    id: 'wiki',
    kind: 'wiki',
    routePrefix: 'w',
    defaultVisibility: 'public',
    isActive: true,
  },
  {
    id: 'generated',
    kind: 'generated',
    routePrefix: 'g',
    defaultVisibility: 'restricted',
    isActive: false,
  },
];

describe('SpaceSettingsPanel', () => {
  function render(locale: 'en' | 'zh' = 'en') {
    return renderToStaticMarkup(
      <ApplicationI18nProvider initialLocale={locale} messages={getMessages(locale)}>
        <SpaceSettingsPanel initialSpaces={spaces} />
      </ApplicationI18nProvider>,
    );
  }

  it('shows space configuration in a table without a page-level save action', () => {
    const html = render();

    expect(html).toContain('<table');
    expect(html).not.toContain('Save changes');
    expect(html).toContain('>Wiki<');
    expect(html).toContain('>Generated<');
    expect(html).toContain('/w');
    expect(html).toContain('/g');
    expect(html).toContain('>Public<');
    expect(html).toContain('>Restricted<');
  });

  it('provides visibility help and an edit action for every row', () => {
    const html = render();

    expect(html).toContain('Explain new page visibility');
    expect(html).toContain('Public pages are readable without signing in after they are published.');
    expect(html).toContain('aria-label="Edit Wiki"');
    expect(html).toContain('aria-label="Edit Generated"');
    expect(html).toContain('aria-label="Reinitialize example pages"');
  });

  it('uses the active locale for the administrative labels', () => {
    const html = render('zh');

    expect(html).toContain('空间设置');
    expect(html).toContain('新页面可见性');
    expect(html).toContain('编辑知识库');
  });
});
