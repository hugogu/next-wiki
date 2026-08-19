// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../../messages/en.json';
import { DemoModeToggle } from './DemoModeToggle';

function render(enabled: boolean): string {
  return renderToStaticMarkup(
    <I18nProvider initialLocale="en" messages={enMessages}>
      <DemoModeToggle enabled={enabled} />
    </I18nProvider>,
  );
}

describe('DemoModeToggle', () => {
  it('renders the catalog-backed label/description and an unchecked switch when off', () => {
    const html = render(false);
    expect(html).toContain('Read-only demo mode');
    expect(html).toContain('every write action is rejected');
    expect(html).toContain('aria-checked="false"');
  });

  it('renders a checked switch when on', () => {
    const html = render(true);
    expect(html).toContain('aria-checked="true"');
  });
});
