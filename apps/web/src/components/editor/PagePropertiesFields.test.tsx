import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import { PagePropertiesFields } from './PagePropertiesFields';

describe('PagePropertiesFields', () => {
  it('shows the current frontmatter synchronization preference', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en">
        <PagePropertiesFields
          title="Guide"
          onTitleChange={() => undefined}
          path="docs/guide"
          onPathChange={() => undefined}
          date=""
          onDateChange={() => undefined}
          tags=""
          onTagsChange={() => undefined}
          summary=""
          onSummaryChange={() => undefined}
          writeMetadataToFrontmatter
          onWriteMetadataToFrontmatterChange={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('Write page metadata to Markdown frontmatter');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });
});
