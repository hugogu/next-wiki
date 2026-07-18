import { describe, expect, it } from 'vitest';
import {
  createWikiJsLinkReplacer,
  extractLocalAssetIds,
  findFrontmatterRelatedPages,
  findMarkdownLinks,
  findMarkdownLinkReferences,
  portableAssetReference,
  rewriteMarkdownImages,
  rewriteMarkdownLinks,
  stripLocalePrefix,
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

  it('finds Markdown link URL positions without touching images', () => {
    const markdown = 'See [Other Page](/zh/docs/other) and ![image](/zh/assets/x.png).';
    const refs = findMarkdownLinkReferences(markdown);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ url: '/zh/docs/other' });
    expect(markdown.slice(refs[0]!.start, refs[0]!.end)).toBe('/zh/docs/other');
  });

  it('rewrites Markdown links from end to start', () => {
    const markdown = '[A](/zh/a) [B](/zh/b)';
    expect(rewriteMarkdownLinks(markdown, (url) => url.replace('/zh', ''))).toBe('[A](/a) [B](/b)');
  });

  it('leaves Markdown links unchanged when replacer returns null', () => {
    const markdown = '[A](/zh/a) [B](https://example.com/zh/b)';
    expect(rewriteMarkdownLinks(markdown, () => null)).toBe(markdown);
  });
});

describe('createWikiJsLinkReplacer (005 Wiki.js import)', () => {
  const replace = createWikiJsLinkReplacer('https://wiki.example.com');

  it('strips locale prefix from internal root-relative links', () => {
    expect(replace('/zh/docs/foo')).toBe('/docs/foo');
    expect(replace('/en-US/docs/foo')).toBe('/docs/foo');
  });

  it('converts same-origin absolute links to root-relative paths', () => {
    expect(replace('https://wiki.example.com/zh/docs/foo')).toBe('/docs/foo');
    expect(replace('https://wiki.example.com/en/docs/foo?x=1')).toBe('/docs/foo?x=1');
    expect(replace('https://wiki.example.com/docs/bar')).toBe('/docs/bar');
  });

  it('strips a locale-only pathname followed by query or fragment', () => {
    expect(replace('https://wiki.example.com/zh')).toBe('/');
    expect(replace('https://wiki.example.com/zh?x=1')).toBe('/?x=1');
    expect(replace('https://wiki.example.com/zh#top')).toBe('/#top');
    expect(replace('https://wiki.example.com/zh?a=1#frag')).toBe('/?a=1#frag');
  });

  it('leaves external absolute links untouched', () => {
    expect(replace('https://other.example.com/zh/docs/foo')).toBeNull();
  });

  it('leaves internal links without a locale prefix untouched', () => {
    expect(replace('/docs/foo')).toBeNull();
  });

  it('leaves relative links untouched when no page path is given', () => {
    expect(replace('solar-system')).toBeNull();
    expect(replace('sub/page')).toBeNull();
  });
});

describe('createWikiJsLinkReplacer relative resolution (page-path aware)', () => {
  const replace = createWikiJsLinkReplacer('https://wiki.example.com', 'astronomy');

  it('resolves a relative link against the page path (page acts as a directory)', () => {
    expect(replace('solar-system')).toBe('/astronomy/solar-system');
    expect(replace('sun')).toBe('/astronomy/sun');
  });

  it('resolves nested relative links', () => {
    const nested = createWikiJsLinkReplacer('https://wiki.example.com', 'entertainment/board-games');
    expect(nested('chess')).toBe('/entertainment/board-games/chess');
    expect(nested('games/index')).toBe('/entertainment/board-games/games/index');
  });

  it('preserves query and fragment on a relative link', () => {
    expect(replace('solar-system?x=1')).toBe('/astronomy/solar-system?x=1');
    expect(replace('solar-system#top')).toBe('/astronomy/solar-system#top');
  });

  it('honours ../ and ./ segments without escaping the wiki root', () => {
    expect(replace('./sun')).toBe('/astronomy/sun');
    expect(replace('../other')).toBe('/other');
    expect(replace('../../way/up')).toBe('/way/up');
  });

  it('still strips locale prefixes from root-relative and absolute links', () => {
    expect(replace('/zh/docs/foo')).toBe('/docs/foo');
    expect(replace('https://wiki.example.com/zh/docs/foo')).toBe('/docs/foo');
  });

  it('leaves anchors, external URLs, and scheme links untouched', () => {
    expect(replace('#section')).toBeNull();
    expect(replace('mailto:test@example.com')).toBeNull();
    expect(replace('tel:+123')).toBeNull();
    expect(replace('//cdn.example.com/x')).toBeNull();
    expect(replace('https://other.example.com/docs')).toBeNull();
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

describe('stripLocalePrefix (005 Wiki.js import)', () => {
  it('strips a 2-letter locale prefix from a root-relative path', () => {
    expect(stripLocalePrefix('/zh/docs/foo')).toBe('/docs/foo');
    expect(stripLocalePrefix('/en/docs/foo')).toBe('/docs/foo');
  });

  it('strips a locale prefix with a region subtag', () => {
    expect(stripLocalePrefix('/zh-CN/docs/foo')).toBe('/docs/foo');
    expect(stripLocalePrefix('/zh-cn/docs/foo')).toBe('/docs/foo');
    expect(stripLocalePrefix('/pt-BR/docs/foo')).toBe('/docs/foo');
  });

  it('is case-insensitive on the language code', () => {
    expect(stripLocalePrefix('/ZH/docs/foo')).toBe('/docs/foo');
    expect(stripLocalePrefix('/En/docs/foo')).toBe('/docs/foo');
  });

  it('strips the locale prefix from an absolute URL', () => {
    expect(stripLocalePrefix('https://wiki.example.com/zh/assets/x.png')).toBe(
      'https://wiki.example.com/assets/x.png',
    );
    expect(stripLocalePrefix('http://wiki.example.com/en/docs/foo?a=1')).toBe(
      'http://wiki.example.com/docs/foo?a=1',
    );
  });

  it('preserves a path with no leading locale', () => {
    expect(stripLocalePrefix('/docs/foo')).toBe('/docs/foo');
    expect(stripLocalePrefix('docs/foo')).toBe('docs/foo');
    expect(stripLocalePrefix('/')).toBe('/');
    expect(stripLocalePrefix('')).toBe('');
  });

  it('preserves non-language 2-letter prefixes (false-positive guard)', () => {
    // "us" is a country code, not ISO 639-1; "go"/"db" are common app paths.
    expect(stripLocalePrefix('/us/foo')).toBe('/us/foo');
    expect(stripLocalePrefix('/go/dashboard')).toBe('/go/dashboard');
    expect(stripLocalePrefix('/db/migrations')).toBe('/db/migrations');
  });

  it('does not strip a 3-letter path segment', () => {
    expect(stripLocalePrefix('/abc/rest')).toBe('/abc/rest');
  });

  it('does not match when the segment is followed by other characters', () => {
    expect(stripLocalePrefix('/zhost/foo')).toBe('/zhost/foo');
  });
});
