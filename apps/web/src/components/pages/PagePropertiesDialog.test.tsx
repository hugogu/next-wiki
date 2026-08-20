import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { PagePropertiesDialog } from './PagePropertiesDialog';

function render(props: Partial<React.ComponentProps<typeof PagePropertiesDialog>> = {}) {
  return renderToStaticMarkup(
    <I18nProvider initialLocale="en" messages={enMessages}>
      <PagePropertiesDialog
        pageId="00000000-0000-4000-8000-000000000001"
        revisionId="00000000-0000-4000-8000-000000000002"
        initialTitle="Guide"
        initialPath="docs/guide"
        initialSlug="docs/guide"
        initialDate="2026-08-05"
        initialTags={['docs', 'guide']}
        initialSummary="A guide"
        initialVisibility="restricted"
        canSetVisibility
        onSaved={() => undefined}
        onClose={() => undefined}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('PagePropertiesDialog', () => {
  it('uses the complete editor properties form without the editor-only frontmatter preference', () => {
    const html = render();

    expect(html).toContain('Title');
    expect(html).toContain('Date');
    expect(html).toContain('Tags');
    expect(html).toContain('Summary');
    expect(html).toContain('Storage path');
    expect(html).toContain('Address');
    expect(html).toContain('Addresses');
    expect(html).toContain('Page visibility');
    expect(html).not.toContain('Write page metadata to Markdown frontmatter');
  });

  it('hides path, address, and visibility controls when they do not apply', () => {
    const html = render({ pathReadOnly: true, canSetVisibility: false });

    expect(html).not.toContain('id="prop-path"');
    expect(html).not.toContain('id="prop-slug"');
    expect(html).not.toContain('Page visibility');
  });
});
