import { stringify as stringifyYaml } from 'yaml';
import { parsePageFrontmatter } from './frontmatter';

describe('parsePageFrontmatter', () => {
  it('round-trips scalar and array frontmatter fields', () => {
    const frontmatter = { tags: ['a', 'b'], status: 'draft' };
    const markdown = `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n# Body\n`;

    const result = parsePageFrontmatter(markdown);

    expect(result.frontmatter).toEqual(frontmatter);
    expect(result.markdown).toBe('# Body\n');
  });

  it('returns null frontmatter when there is no --- block', () => {
    const result = parsePageFrontmatter('# Just a heading\n\nNo frontmatter here.');

    expect(result.frontmatter).toBeNull();
    expect(result.markdown).toBe('# Just a heading\n\nNo frontmatter here.');
  });

  it('returns null frontmatter (no throw) for malformed YAML', () => {
    const markdown = '---\ntags: [unclosed\n---\n\n# Body\n';

    const result = parsePageFrontmatter(markdown);

    expect(result.frontmatter).toBeNull();
  });

  it('round-trips nested objects and arrays of objects losslessly', () => {
    const frontmatter = {
      related_pages: ['a/b', 'c/d'],
      meta: { author: { name: 'Ada', links: [{ rel: 'self', href: '/ada' }] } },
    };
    const markdown = `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\nBody text\n`;

    const result = parsePageFrontmatter(markdown);

    expect(result.frontmatter).toEqual(frontmatter);
  });
});
