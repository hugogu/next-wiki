import { describe, expect, it } from 'vitest';
import { markdownBody, mergeSupportedMetadata, normalizeTagName, supportedMetadataFromFrontmatter } from './frontmatter';

describe('supported page metadata frontmatter', () => {
  it('normalizes tags and preserves unrelated frontmatter/body on update', () => {
    const result = mergeSupportedMetadata('---\nowner: alice\ntags: [Old]\n---\n\n# Body', { tags: ['DevOps'], summary: 'Summary', date: '2026-07-10' }, 'Fallback');
    expect(result.metadata).toMatchObject({ title: 'Fallback', tags: ['DevOps'], summary: 'Summary', date: '2026-07-10' });
    expect(result.source).toContain('owner: alice');
    expect(result.source).toContain('# Body');
  });

  it('rejects duplicate normalized tags and malformed calendar dates', () => {
    expect(() => mergeSupportedMetadata('', { tags: ['DevOps', ' devops '] }, 'Title')).toThrow('Tags must be unique');
    expect(() => supportedMetadataFromFrontmatter({ date: '2026-02-31' })).toThrow('Date must be a valid');
  });

  it('returns only the body for valid frontmatter and raw source for malformed YAML', () => {
    expect(markdownBody('---\ntags: [a]\n---\n\n# Body')).toBe('# Body');
    expect(markdownBody('---\ntags: [\n---\n\n# Body')).toContain('tags: [');
    expect(normalizeTagName(' DevOps ')).toBe('devops');
  });
});
