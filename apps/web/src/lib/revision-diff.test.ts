import { describe, expect, it } from 'vitest';
import { buildDiffRows, tokenizeSource, withContext } from './revision-diff';

describe('revision diff model', () => {
  it('retains original line numbers and pairs replacements', () => {
    const rows = buildDiffRows('one\ntwo\nthree', 'one\nnext\nthree');
    expect(rows.map((row) => row.kind)).toEqual(['unchanged', 'changed', 'unchanged']);
    expect(rows[1]).toMatchObject({
      left: { number: 2, text: 'two' },
      right: { number: 2, text: 'next' },
    });
  });

  it('keeps repeated unchanged lines aligned to their original positions', () => {
    const rows = buildDiffRows('repeat\nchange\nrepeat', 'repeat\nnext\nrepeat');
    expect(rows[2]).toMatchObject({
      left: { number: 3, text: 'repeat' },
      right: { number: 3, text: 'repeat' },
      kind: 'unchanged',
    });
  });

  it('ignores all whitespace without rewriting the displayed source', () => {
    const rows = buildDiffRows('a b\n\t', 'ab\n', true);
    expect(rows.every((row) => row.kind === 'unchanged')).toBe(true);
    expect(rows[0]).toMatchObject({ left: { text: 'a b' }, right: { text: 'ab' } });
  });

  it('collapses unchanged rows outside requested context', () => {
    const before = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n');
    const after = before.replace('line 5', 'changed');
    const rows = withContext(buildDiffRows(before, after), 1);
    expect(rows.some((row) => row.kind === 'collapsed')).toBe(true);
    expect(rows.filter((row) => row.kind === 'changed')).toHaveLength(1);
  });

  it('supports zero and full context around additions and removals', () => {
    const rows = buildDiffRows('one\ntwo\nthree', 'one\nthree\nfour');
    expect(withContext(rows, 0).map((row) => row.kind)).toEqual([
      'collapsed',
      'removed',
      'collapsed',
      'added',
    ]);
    expect(withContext(rows, 'full')).toEqual(rows);
  });

  it('handles empty sources and representative large documents', () => {
    expect(buildDiffRows('', 'added')).toMatchObject([{ kind: 'added', right: { number: 1 } }]);
    const before = Array.from({ length: 5_000 }, (_, index) => `line ${index + 1}`).join('\n');
    const after = before.replace('line 2500', 'changed line');
    expect(buildDiffRows(before, after)).toHaveLength(5_000);
  });

  it('ignores leading, trailing, internal, tab, and blank-line whitespace-only edits', () => {
    const before = '  before after  \n\t\n';
    const after = 'beforeafter\n\n';
    expect(buildDiffRows(before, after, true).every((row) => row.kind === 'unchanged')).toBe(true);
  });

  it('normalizes CRLF and removes the synthetic final empty line', () => {
    expect(tokenizeSource('one\r\ntwo\r\n')).toEqual([
      expect.objectContaining({ number: 1, text: 'one' }),
      expect.objectContaining({ number: 2, text: 'two' }),
    ]);
  });
});
