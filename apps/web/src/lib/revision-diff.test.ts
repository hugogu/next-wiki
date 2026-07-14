import { describe, expect, it } from 'vitest';
import { buildDiffRows, tokenizeSource, withContext } from './revision-diff';

describe('revision diff model', () => {
  it('retains original line numbers and pairs replacements', () => {
    const rows = buildDiffRows('one\ntwo\nthree', 'one\nnext\nthree');
    expect(rows.map((row) => row.kind)).toEqual(['unchanged', 'changed', 'unchanged']);
    expect(rows[1]).toMatchObject({ left: { number: 2, text: 'two' }, right: { number: 2, text: 'next' } });
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

  it('normalizes CRLF and removes the synthetic final empty line', () => {
    expect(tokenizeSource('one\r\ntwo\r\n')).toEqual([
      expect.objectContaining({ number: 1, text: 'one' }),
      expect.objectContaining({ number: 2, text: 'two' }),
    ]);
  });
});
