import { describe, expect, it } from 'vitest';
import {
  collectWikiLinkTargets,
  defaultWikiLinkHref,
  matchWikiLinkTarget,
  normalizeWikiLinkTarget,
  parseWikiLink,
  WIKILINK_PATTERN,
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
    { path: 'knowledge/ops/foo', slug: 'knowledge/ops/foo' },
    { path: 'archive/ops/bar', slug: 'archive/ops/bar' },
    { path: 'notes/ops/bar', slug: 'notes/ops/bar' },
    { path: 'guides/install', slug: 'setup' },
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
});
