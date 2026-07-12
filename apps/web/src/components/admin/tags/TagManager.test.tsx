import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import { TagManager } from './TagManager';

describe('TagManager', () => {
  it('presents tag creation, registry search, and a dedicated detail workspace', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en">
        <TagManager />
      </I18nProvider>,
    );

    expect(html).toContain('Create a tag');
    expect(html).toContain('Search tags');
    expect(html).toContain('Select a tag to review its details and related pages.');
    expect(html).not.toContain('window.prompt');
  });
});
