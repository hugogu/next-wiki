import { describe, expect, it } from 'vitest';
import { getRevisionDiffHref, parseRevisionDiffOptions, parseRevisionPair } from './path';

describe('revision diff URLs', () => {
  it('sorts a pair into its canonical address', () => {
    expect(getRevisionDiffHref('guide/one', 8, 3)).toBe('/revisions/3..8/guide/one');
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
