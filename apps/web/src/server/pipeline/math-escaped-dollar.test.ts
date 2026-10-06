import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { remarkMathWithEscapedDollar } from './math-escaped-dollar';

const parse = (source: string) => unified().use(remarkParse).use(remarkMathWithEscapedDollar).parse(source);
const parseUpstream = (source: string) => unified().use(remarkParse).use(remarkMath).parse(source);

/** The TeX of every inline math span, in document order. */
function spans(source: string): string[] {
  const found: string[] = [];
  visit(parse(source), 'inlineMath', (node) => {
    found.push(node.value);
  });
  return found;
}

describe('remarkMathWithEscapedDollar', () => {
  describe('an escaped dollar sign inside inline math', () => {
    it('is content, not the end of the span', () => {
      expect(spans('$\\$100{,}000$')).toEqual(['\\$100{,}000']);
    });

    it('leaves every later span on the line paired with its own delimiters', () => {
      // Upstream closes the first span at its `\$`, so each later `$` pairs
      // with the wrong neighbour and nothing on the line is a formula.
      expect(spans('投入 $\\$100{,}000$，每年 $\\$30{,}000$ 现金流，折现率 $10\\%$：')).toEqual([
        '\\$100{,}000',
        '\\$30{,}000',
        '10\\%',
      ]);
    });

    it('may be the last thing in the span', () => {
      expect(spans('$x \\$$')).toEqual(['x \\$']);
    });

    it('is content in a double-dollar span too', () => {
      expect(spans('$$\\$5$$')).toEqual(['\\$5']);
    });

    it('is content in a span that runs on to the next line', () => {
      expect(spans('$a \\$\nb$')).toHaveLength(1);
    });
  });

  describe('backslash pairing', () => {
    it('lets a `$` close the span after an escaped backslash, as TeX reads `\\\\`', () => {
      expect(spans('$a\\\\$ b')).toEqual(['a\\\\']);
    });

    it('keeps the span open when an odd run of backslashes precedes the `$`', () => {
      expect(spans('$a\\\\\\$b$')).toEqual(['a\\\\\\$b']);
    });
  });

  describe('outside inline math', () => {
    it('is still a character escape, so it never opens a span', () => {
      expect(spans('costs \\$5 and $x$')).toEqual(['x']);
    });

    it('does not turn a lone `$` and a later escaped one into a span', () => {
      // The old pairing read `$5 and \$` as math with the body `5 and \`.
      expect(spans('I have $5 and \\$6')).toEqual([]);
    });
  });

  it('leaves block math alone', () => {
    expect(parse('$$\n\\$ x\n$$').children[0]).toMatchObject({ type: 'math', value: '\\$ x' });
  });

  describe('everything else parses exactly as upstream does', () => {
    // Inputs with no `\$` inside a span. Any difference here would be a change
    // to a rule this module has no business touching, such as delimiter-run
    // length, space padding or what may precede an opening `$`.
    const corpus = [
      '$a$',
      '$ a $',
      '$a  b$',
      '$$a$$',
      '$a$$b$',
      '$$a$b$$',
      '$$ $ $$',
      'Not math: $$x$.',
      'Not math: $x$$.',
      'Escapes work: \\$$x$ and $x$\\$.',
      'a $b$ c $d$ e',
      '$a\nb$',
      '$a\n\nb$',
      '$ $',
      '$',
      '$$',
      'a $ b',
      '$a',
      'a$',
      '$\\alpha + \\beta$',
      '$\\{x\\}$',
      '$a\\ $',
      '$a \\\\ b$',
      '$a\\\\$ b',
      '$\\\\\\\\$',
      '`$a$`',
      '```\n$a$\n```',
      '$$\nx\n$$',
      '$$\n\\$ x\n$$',
      '| $a$ | b |\n| - | - |\n| c | $d$ |',
    ];

    for (const source of corpus) {
      it(`parses ${JSON.stringify(source)} as upstream does`, () => {
        expect(parse(source)).toEqual(parseUpstream(source));
      });
    }
  });
});
