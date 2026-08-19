// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import zhMessages from '../../../messages/zh.json';
import { DemoReadonlyBanner } from './DemoReadonlyBanner';

describe('DemoReadonlyBanner', () => {
  it('renders the catalog-backed notice in English', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <DemoReadonlyBanner />
      </I18nProvider>,
    );
    expect(html).toContain('Read-only demo');
  });

  it('renders the catalog-backed notice in Chinese', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="zh" messages={zhMessages}>
        <DemoReadonlyBanner />
      </I18nProvider>,
    );
    expect(html).toContain('只读演示模式');
  });
});
