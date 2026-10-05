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

  it('renders tags as chips from the shared EditableTagList, not a free-text field', () => {
    const html = renderWithI18n(
      <PagePropertiesFields
        title="Guide"
        onTitleChange={() => undefined}
        tags="devops, docker"
        onTagsChange={() => undefined}
      />,
    );

    expect(html).toContain('devops');
    expect(html).toContain('docker');
    // The old free-text picker's affordances must be gone.
    expect(html).not.toContain('Separate tags with commas');
    expect(html).not.toContain('id="prop-tags"');
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

  it('offers an AI attribution declaration control only when the caller provides permission', () => {
    const html = renderWithI18n(<PagePropertiesFields
      title="Guide"
      onTitleChange={() => undefined}
      aiContentLevel="generated"
      onAiContentLevelChange={() => undefined}
    />);
    expect(html).toContain('AI content label');
    expect(html).toContain('AI generated');
    expect(html).toContain('AI assisted');
    expect(html).toContain('No label');
  });

  describe('page language', () => {
    const render = (props: { locale?: string | null; withHandler?: boolean }) =>
      renderWithI18n(
        <PagePropertiesFields
          title="Guide"
          onTitleChange={() => undefined}
          locale={props.locale}
          onLocaleChange={props.withHandler === false ? undefined : () => undefined}
        />,
      );

    it('offers "Not set" and the supported languages, with "Not set" chosen when the page has none', () => {
      const html = render({ locale: null });

      expect(html).toContain('id="prop-locale"');
      expect(html).toContain('Language');
      expect(html).toContain('<option value="" selected="">Not set</option>');
      expect(html).toContain('English (en)');
      expect(html).toContain('Chinese (Simplified) (zh)');
    });

    it('chooses the language the page already has', () => {
      const html = render({ locale: 'zh' });

      expect(html).toContain('<option value="zh" selected="">Chinese (Simplified) (zh)</option>');
      expect(html).not.toContain('<option value="" selected="">');
    });

    it('still shows a language outside the supported list instead of looking unset', () => {
      // For example one carried in by a Wiki.js import.
      const html = render({ locale: 'fr-CA' });

      expect(html).toContain('<option value="fr-CA" selected="">fr-CA</option>');
    });

    it('is left out where the language cannot be changed', () => {
      // A translation has no language of its own to set; so does a caller that
      // does not know the page's language.
      expect(render({ locale: undefined })).not.toContain('id="prop-locale"');
      expect(render({ locale: 'en', withHandler: false })).not.toContain('id="prop-locale"');
    });
  });
});
