import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../../../test/i18n-test-utils';
import { TagManager } from './TagManager';

describe('TagManager', () => {
  it('presents tag creation, registry search, and a dedicated detail workspace', () => {
    const html = renderWithI18n(<TagManager />);

    expect(html).toContain('Create a tag');
    expect(html).toContain('Search tags');
    expect(html).toContain('Select a tag to review its details and related pages.');
    expect(html).not.toContain('window.prompt');
  });
});
