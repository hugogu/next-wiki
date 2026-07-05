import { describe, expect, it } from 'vitest';
import {
  extractLocalAssetIds,
  findFrontmatterRelatedPages,
  findMarkdownLinks,
  portableAssetReference,
  rewriteMarkdownImages,
} from './markdown-links';

describe('Markdown transfer links', () => {
  it('discovers and rewrites image URLs without changing links or text', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    const markdown = `![local](/api/assets/${id}) [link](/api/assets/${id}) ![remote](https://example.com/a.png)`;
    expect(extractLocalAssetIds(markdown)).toEqual([id]);
    expect(
      rewriteMarkdownImages(markdown, (url) => (url.startsWith('/api/assets/') ? '../asset.png' : null)),
    ).toContain('![local](../asset.png)');
    expect(portableAssetReference('pages/en/a/b.md', 'assets/hash.png')).toBe(
      '../../../assets/hash.png',
    );
  });
});

describe('findMarkdownLinks (010-ai-curation-api)', () => {
  it('finds a standard Markdown link', () => {
    const links = findMarkdownLinks('See [Other Page](docs/other) for details.');
    expect(links).toEqual([{ source: 'markdown', target: 'docs/other', linkText: 'Other Page', external: false }]);
  });

  it('finds a bare wikilink and a wikilink with an alias', () => {
    const links = findMarkdownLinks('See [[docs/other]] and [[docs/third|Third Page]].');
    expect(links).toEqual([
      { source: 'wiki', target: 'docs/other', linkText: 'docs/other', external: false },
      { source: 'wiki', target: 'docs/third', linkText: 'Third Page', external: false },
    ]);
  });

  it('marks https:// Markdown links as external', () => {
    const links = findMarkdownLinks('External: [Example](https://example.com/page).');
    expect(links).toEqual([{ source: 'markdown', target: 'https://example.com/page', linkText: 'Example', external: true }]);
  });

  it('finds all three link forms together', () => {
    const markdown = '[Markdown Link](docs/md) and [[docs/wiki]] and [External](https://example.com)';
    const links = findMarkdownLinks(markdown);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.source).sort()).toEqual(['markdown', 'markdown', 'wiki']);
    expect(links.some((l) => l.external)).toBe(true);
  });
});

describe('findFrontmatterRelatedPages (010-ai-curation-api)', () => {
  it('reads a string array related_pages key', () => {
    expect(findFrontmatterRelatedPages({ related_pages: ['a/b', 'c/d'] })).toEqual(['a/b', 'c/d']);
  });

  it('returns an empty array when related_pages is absent or malformed', () => {
    expect(findFrontmatterRelatedPages(null)).toEqual([]);
    expect(findFrontmatterRelatedPages({})).toEqual([]);
    expect(findFrontmatterRelatedPages({ related_pages: 'not-an-array' })).toEqual([]);
    expect(findFrontmatterRelatedPages({ related_pages: [1, 2] })).toEqual([]);
  });
});
