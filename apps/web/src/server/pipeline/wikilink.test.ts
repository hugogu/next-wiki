import { describe, expect, it } from 'vitest';
import {
  collectWikiLinkTargets,
  defaultWikiLinkHref,
  matchWikiLinkTarget,
  normalizeWikiLinkTarget,
  parseWikiLink,
  WIKILINK_PATTERN,
  wikiLinkTitleKey,
} from './wikilink';

function parseAll(markdown: string) {
  return [...markdown.matchAll(WIKILINK_PATTERN)].map((match) => parseWikiLink(match));
}

describe('wikilink syntax', () => {
  it('parses a bare target, an alias, and a heading fragment', () => {
    expect(parseAll('[[ops/foo]] [[ops/bar|Bar]] [[ops/baz#setup]] [[ops/qux#setup|Qux]]')).toEqual([
      { target: 'ops/foo', hash: '', label: 'ops/foo' },
      { target: 'ops/bar', hash: '', label: 'Bar' },
      { target: 'ops/baz', hash: '#setup', label: 'ops/baz#setup' },
      { target: 'ops/qux', hash: '#setup', label: 'Qux' },
    ]);
  });

  it('ignores an empty target and does not span lines', () => {
    expect(parseAll('[[]] and [[\nops/foo]]')).toEqual([]);
  });

  it('normalizes a target to a page address', () => {
    expect(normalizeWikiLinkTarget('/ops/foo/')).toBe('ops/foo');
    expect(normalizeWikiLinkTarget(' ops/foo.md ')).toBe('ops/foo');
  });

  it('collects distinct normalized targets', () => {
    expect(collectWikiLinkTargets('[[ops/foo]] [[/ops/foo]] [[ops/bar|Bar]]')).toEqual([
      'ops/foo',
      'ops/bar',
    ]);
  });

  it('addresses an unresolved target from the site root', () => {
    expect(defaultWikiLinkHref({ target: 'ops/foo', hash: '#setup', label: 'ops/foo' })).toBe(
      '/ops/foo#setup',
    );
  });
});

describe('matchWikiLinkTarget', () => {
  const pages = [
    { path: 'knowledge/ops/foo', slug: 'knowledge/ops/foo', title: 'Foo' },
    { path: 'archive/ops/bar', slug: 'archive/ops/bar', title: 'Bar (archived)' },
    { path: 'notes/ops/bar', slug: 'notes/ops/bar', title: 'Bar (notes)' },
    { path: 'guides/install', slug: 'setup', title: 'Install guide' },
    { path: 'tech/ai/llm', slug: 'tech/ai/llm', title: 'LLM 大语言模型' },
  ];

  it('resolves a partial path that names exactly one page', () => {
    expect(matchWikiLinkTarget('ops/foo', pages)?.slug).toBe('knowledge/ops/foo');
  });

  it('prefers an exact address over a suffix of a different page', () => {
    expect(matchWikiLinkTarget('setup', pages)?.path).toBe('guides/install');
  });

  it('resolves a target written as a tree path', () => {
    expect(matchWikiLinkTarget('guides/install', pages)?.slug).toBe('setup');
  });

  it('refuses to guess when a suffix names more than one page', () => {
    expect(matchWikiLinkTarget('ops/bar', pages)).toBeNull();
  });

  it('returns null for a target no page carries', () => {
    expect(matchWikiLinkTarget('ops/missing', pages)).toBeNull();
  });

  describe('by title', () => {
    it('resolves the title a page shows, whatever script it is written in', () => {
      expect(matchWikiLinkTarget('LLM 大语言模型', pages)?.slug).toBe('tech/ai/llm');
      expect(matchWikiLinkTarget('Install guide', pages)?.slug).toBe('setup');
    });

    it('ignores case and surrounding whitespace in the title', () => {
      expect(matchWikiLinkTarget('llm 大语言模型', pages)?.slug).toBe('tech/ai/llm');
      expect(matchWikiLinkTarget('  INSTALL GUIDE ', pages)?.slug).toBe('setup');
      expect(
        matchWikiLinkTarget('Spaced', [{ path: 'a', slug: 'a', title: ' spaced ' }])?.slug,
      ).toBe('a');
    });

    it('does not match part of a title', () => {
      expect(matchWikiLinkTarget('Install', pages)).toBeNull();
      expect(matchWikiLinkTarget('LLM', pages)).toBeNull();
    });

    it('prefers an address over a title that happens to read the same', () => {
      const candidates = [
        { path: 'support/questions', slug: 'support/questions', title: 'FAQ' },
        { path: 'guides/help', slug: 'faq', title: 'Help' },
      ];
      expect(matchWikiLinkTarget('faq', candidates)?.slug).toBe('faq');
    });

    it('prefers a title over a path suffix', () => {
      const candidates = [
        { path: 'guides/setup', slug: 'guides/setup', title: 'Getting started' },
        { path: 'install/windows', slug: 'install/windows', title: 'Setup' },
      ];
      expect(matchWikiLinkTarget('setup', candidates)?.slug).toBe('install/windows');
    });

    it('refuses to guess when two pages share the title', () => {
      const twins = [
        { path: 'a/overview', slug: 'a/overview', title: 'Overview' },
        { path: 'b/overview', slug: 'b/overview', title: 'Overview' },
      ];
      expect(matchWikiLinkTarget('Overview', twins)).toBeNull();
    });

    it('does not fall through to a path suffix once a title is ambiguous', () => {
      const candidates = [
        { path: 'x/setup', slug: 'x/setup', title: 'Third' },
        { path: 'b/one', slug: 'b/one', title: 'Setup' },
        { path: 'c/two', slug: 'c/two', title: 'Setup' },
      ];
      // `setup` is a path suffix of exactly one page, but two pages are titled
      // "Setup": the author named a title, and that title does not name one page.
      expect(matchWikiLinkTarget('setup', candidates)).toBeNull();
    });
  });
});

describe('wikiLinkTitleKey', () => {
  it('folds case and trims, and keeps inner spacing', () => {
    expect(wikiLinkTitleKey('  Vibe Coding 工具 ')).toBe('vibe coding 工具');
  });
});
