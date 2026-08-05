import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../../test/i18n-test-utils';
import { PagePropertiesFields } from './PagePropertiesFields';

describe('PagePropertiesFields', () => {
  it('shows the current frontmatter synchronization preference', () => {
    const html = renderWithI18n(
      <>
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
      </>,
    );

    expect(html).toContain('Write page metadata to Markdown frontmatter');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });

  it('can expose page visibility while omitting properties that do not apply', () => {
    const html = renderWithI18n(
      <PagePropertiesFields
        title="Guide"
        onTitleChange={() => undefined}
        visibility="restricted"
        onVisibilityChange={() => undefined}
      />,
    );

    expect(html).toContain('Page visibility');
    expect(html).toContain('Restricted');
    expect(html).toContain('Registered users');
    expect(html).not.toContain('Write page metadata to Markdown frontmatter');
    expect(html).not.toContain('id="prop-path"');
  });
});
