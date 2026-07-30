import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../../../test/i18n-test-utils';
import { TagManager } from './TagManager';

describe('TagManager', () => {
  it('presents registry search and a dedicated detail workspace without a standalone create form', () => {
    const html = renderWithI18n(<TagManager />);

    expect(html).toContain('Search tags');
    expect(html).toContain('Select a tag to review its details and related pages.');
    // Tags are now created inline on pages, so the standalone create form is gone.
    expect(html).not.toContain('Create a tag');
    expect(html).not.toContain('window.prompt');
  });

  it('offers no space filter when only the wiki space exists', () => {
    expect(renderWithI18n(<TagManager />)).not.toContain('Generated');
  });

  it('offers one chip per space in LLM Wiki mode, so Raw and Generated tags are reachable', () => {
    const html = renderWithI18n(<TagManager spaceFilterEnabled />);

    expect(html).toContain('Wiki');
    expect(html).toContain('Generated');
    expect(html).toContain('Raw');
    // The wiki space is the initial selection.
    expect(html).toContain('aria-pressed="true"');
  });
});
