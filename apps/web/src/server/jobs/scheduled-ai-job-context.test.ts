import { describe, expect, it } from 'vitest';
import { expandScheduledJobContext } from './scheduled-ai-job-context';

describe('scheduled Job prompt context', () => {
  it('expands only the documented dynamic context references', () => {
    expect(expandScheduledJobContext('Use {{TOOLS}}, {{skills}}, and {{scope}}. Keep {{unknown}}.', {
      tools: [{ name: 'get_page', description: 'Read a page' }],
      skills: [{ name: 'wiki-linker', description: 'Propose links' }],
      spaceIds: ['space-1'],
    })).toBe('Use - get_page: Read a page, - wiki-linker: Propose links, and Allowed spaces: space-1. Keep {{unknown}}.');
  });
});
