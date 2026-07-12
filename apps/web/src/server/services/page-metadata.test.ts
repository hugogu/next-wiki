import { describe, expect, it } from 'vitest';
import { metadataFromSource, patchMetadata } from './page-metadata';

describe('page metadata writer helpers', () => {
  it('preserves unrelated frontmatter while synchronizing supported metadata', () => {
    const result = patchMetadata('---\nowner: platform\ntags: [Old]\n---\n\n# Body', {
      title: 'New title', date: '2026-07-10', tags: ['DevOps'], summary: 'Summary',
    }, 'Fallback');
    expect(result.source).toContain('owner: platform');
    expect(metadataFromSource(result.source, 'Fallback')).toEqual({
      title: 'New title', date: '2026-07-10', tags: ['DevOps'], summary: 'Summary',
    });
  });
});
