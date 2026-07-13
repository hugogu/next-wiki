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
});
