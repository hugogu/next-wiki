import { describe, expect, it } from 'vitest';
import { protectMathPipes } from './protect-math-pipes';

const PLACEHOLDER = String.fromCharCode(0xe000);

describe('protectMathPipes', () => {
  it('is a no-op without both `$` and `|`', () => {
    expect(protectMathPipes('plain text')).toBe('plain text');
    expect(protectMathPipes('$x$ only, no pipes')).toBe('$x$ only, no pipes');
    expect(protectMathPipes('a | b, no math')).toBe('a | b, no math');
  });

  it('only touches pipes inside a math span, not the table delimiters around it', () => {
    const noPipeInMath = '| A | B |\n| --- | --- |\n| $x$ | plain |';
    expect(protectMathPipes(noPipeInMath)).toBe(noPipeInMath);

    // Two real table delimiters plus a trailing/leading one (3 total, 4
    // cells worth of boundaries) around a math span with two more `|`s
    // inside it (5 literal `|` in the raw row).
    const pipeInMath = '| A | B |\n| --- | --- |\n| $|x|$ | plain |';
    const row = protectMathPipes(pipeInMath).split('\n')[2]!;
    // Only the 3 real delimiters should remain as literal `|` — the two
    // inside the math span must have been swapped for the placeholder.
    expect(row.split('|')).toHaveLength(4);
    expect(row).toContain(PLACEHOLDER);
  });

  it('leaves a double-backtick code span untouched, even one that looks like math with pipes', () => {
    // A single-backtick-only guard would treat the leading/trailing `` `` ``
    // pairs as two empty code spans and "protect" the `$|x|$` in between —
    // but this is one code span end to end, never math, so it must survive
    // byte-for-byte (no leaked placeholder for `restoreMathPipes` to miss,
    // since it never visits `inlineCode` nodes).
    const source = 'text ``$|x|$`` more';
    expect(protectMathPipes(source)).toBe(source);
  });

  it('bails out entirely if the source already contains the placeholder codepoint', () => {
    // A user's TeX could legitimately contain a private-use codepoint (e.g.
    // a custom symbol font). If it collides with our placeholder,
    // restoreMathPipes couldn't tell "was a `|`" from "was already this
    // character", so protection must refuse to run rather than risk turning
    // that character into a `|` it never was.
    const collision = `| a |\n| --- |\n| $\\text{${PLACEHOLDER}} | x|$ |`;
    expect(protectMathPipes(collision)).toBe(collision);
  });
});
