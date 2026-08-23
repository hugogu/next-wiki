import { describe, expect, it } from 'vitest';
import {
  defaultComparePair,
  getConfiguredSpaceHref,
  getRevisionDiffHref,
  getSpaceDraftReviewHref,
  getSpaceHref,
  parseRevisionDiffOptions,
  parseRevisionPair,
} from './path';

describe('configured space URLs', () => {
  it('uses the configured prefix before locale and page path', () => {
    expect(getConfiguredSpaceHref('g', 'concepts/payment', 'zh')).toBe('/g/zh/concepts/payment');
  });
});

describe('space hrefs', () => {
  it('keeps wiki pages at the site root', () => {
    expect(getSpaceHref('wiki', 'docs/deploy')).toBe('/docs/deploy');
    expect(getSpaceHref('wiki')).toBe('/');
  });

  it('addresses raw/generated pages under their canonical public prefix', () => {
    expect(getSpaceHref('raw', 'conversations/feishu/2026/07/21/action-1')).toBe(
      '/raw/conversations/feishu/2026/07/21/action-1',
    );
    expect(getSpaceHref('generated', 'concepts/rrf')).toBe('/generated/concepts/rrf');
  });

  it('keeps the raw/generated space root on the admin-only /spaces/{space} route', () => {
    expect(getSpaceHref('raw')).toBe('/spaces/raw');
    expect(getSpaceHref('generated')).toBe('/spaces/generated');
  });
});

describe('revision diff URLs', () => {
  it('sorts a pair into its canonical address', () => {
    expect(getRevisionDiffHref('guide/one', 8, 3)).toBe('/revisions/3..8/guide/one');
  });

  it('builds draft review URLs for first and subsequent revisions', () => {
    expect(getSpaceDraftReviewHref('wiki', 'guide/one', 1)).toBe('/h/guide/one?selected=1');
    expect(getSpaceDraftReviewHref('generated', 'guide/one', 3)).toBe(
      '/h/guide/one?space=generated&compare=2..3',
    );
  });

  it('identifies a reversed valid pair and rejects identical versions', () => {
    expect(parseRevisionPair('8..3')).toEqual({ earlier: 3, later: 8, reversed: true });
    expect(parseRevisionPair('3..3')).toBeNull();
  });

  it('uses documented defaults for malformed options', () => {
    expect(parseRevisionDiffOptions(new URLSearchParams('view=other&context=-1&sync=0'))).toEqual({
      view: 'source',
      context: 3,
      ignoreWhitespace: false,
      sync: false,
    });
  });

  it('rejects single-version values and serializes non-default options', () => {
    expect(parseRevisionPair('8')).toBeNull();
    expect(
      getRevisionDiffHref('guide/one', 3, 8, {
        view: 'preview',
        context: 'full',
        ignoreWhitespace: true,
        sync: false,
      }),
    ).toBe('/revisions/3..8/guide/one?view=preview&context=full&ignoreWhitespace=1&sync=0');
  });
});

/**
 * History opens on the most recent change (018 follow-up).
 *
 * Opening History almost always means "what changed most recently", but the
 * page landed on an empty "select two revisions" pane unless the URL already
 * carried a comparison — which only happened on the post-save redirect. Every
 * other visitor made the same two clicks.
 */
describe('defaultComparePair', () => {
  // getHistory returns newest first.
  const history = (...versions: number[]) => versions.map((version) => ({ version }));

  it('compares the two newest revisions', () => {
    expect(defaultComparePair(history(5, 4, 3, 2, 1))).toEqual({ earlier: 4, later: 5 });
  });

  it('returns null when there is nothing to compare', () => {
    expect(defaultComparePair(history(1))).toBeNull();
    expect(defaultComparePair([])).toBeNull();
  });

  it('uses the two newest VISIBLE revisions, not latest minus one', () => {
    // A reader who cannot see drafts gets a list with holes in it. Deriving
    // from `latest - 1` would produce a pair pointing at a revision they are
    // not allowed to read, and 404 the whole page.
    expect(defaultComparePair(history(9, 6, 2))).toEqual({ earlier: 6, later: 9 });
  });

  it('orders the pair earlier-before-later regardless of list order', () => {
    const pair = defaultComparePair(history(12, 11));
    expect(pair!.earlier).toBeLessThan(pair!.later);
  });

  it('agrees with what parseRevisionPair would produce for the same URL', () => {
    // The default must be expressible as a URL the selector can round-trip,
    // otherwise clicking a revision would jump somewhere unrelated.
    const pair = defaultComparePair(history(3, 2))!;
    expect(parseRevisionPair(`${pair.earlier}..${pair.later}`)).toEqual({
      earlier: pair.earlier,
      later: pair.later,
      reversed: false,
    });
  });
});
