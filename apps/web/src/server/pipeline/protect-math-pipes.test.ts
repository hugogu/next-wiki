import { describe, expect, it } from 'vitest';
import { protectMathPipes } from './protect-math-pipes';
import { renderMarkdown } from './index';

const PLACEHOLDER = String.fromCharCode(0xe000);

describe('protectMathPipes', () => {
  it('is a no-op without both `$` and `|`', () => {
    expect(protectMathPipes('plain text')).toBe('plain text');
    expect(protectMathPipes('$x$ only, no pipes')).toBe('$x$ only, no pipes');
    expect(protectMathPipes('a | b, no math')).toBe('a | b, no math');
  });

  it('protects pipes inside a math span but not the table delimiters around it', () => {
    const noPipeInMath = '| A | B |\n| --- | --- |\n| $x$ | plain |';
    expect(protectMathPipes(noPipeInMath)).toBe(noPipeInMath);

    const row = protectMathPipes('| A | B |\n| --- | --- |\n| $|x|$ | plain |').split('\n')[2]!;
    // Only the 3 real cell delimiters stay literal; the 2 inside `$…$` change.
    expect(row.split('|')).toHaveLength(4);
    expect(row).toContain(PLACEHOLDER);
  });

  it('treats an escaped dollar as literal, so it never opens a math span', () => {
    // remark-math sees no math here at all (`\$` is a character escape and the
    // trailing `$` has nothing to pair with), so protecting these pipes would
    // strand placeholders in a plain text node.
    expect(protectMathPipes('\\$|x|$')).toBe('\\$|x|$');
    // An escaped backslash is consumed as its own escape, leaving the `$` free
    // to open a span — matching remark-math.
    expect(protectMathPipes('a \\\\$|x|$')).toContain(PLACEHOLDER);
  });

  it('does not treat a backslash as escaping a closing delimiter', () => {
    // Verified against remark-math: `$a \$ b$` is math with the body `a \`,
    // i.e. the span ends at the `\$`, not past it.
    const protectedSource = protectMathPipes('$a |b| \\$ c|d|$');
    expect(protectedSource).toContain(`a ${PLACEHOLDER}b${PLACEHOLDER} \\`);
    expect(protectedSource).toContain('c|d|');
  });

  it('only closes a delimiter run of matching length', () => {
    // `$$…$$$` is not math to remark-math, so nothing should be protected.
    expect(protectMathPipes('$$a|b$$$')).toBe('$$a|b$$$');
    expect(protectMathPipes('$$$a|b$$')).toBe('$$$a|b$$');
    expect(protectMathPipes('$$$a|b$$$')).toContain(PLACEHOLDER);
  });

  it('leaves an unclosed delimiter run alone', () => {
    expect(protectMathPipes('$foo |x| bar')).toBe('$foo |x| bar');
    // A blank line ends the block, so the later `$` cannot close the earlier one.
    expect(protectMathPipes('$foo\n\n|x| bar$')).toBe('$foo\n\n|x| bar$');
  });

  it('skips code spans of any backtick-run length', () => {
    expect(protectMathPipes('text `$|x|$` more')).toBe('text `$|x|$` more');
    expect(protectMathPipes('text ``$|x|$`` more')).toBe('text ``$|x|$`` more');
  });

  it('skips a code span that spans multiple lines', () => {
    // Code spans are inline constructs and may cross line boundaries, so this
    // cannot be decided one line at a time.
    const source = 'text `foo\n$|x|$\nbar` more';
    expect(protectMathPipes(source)).toBe(source);
  });

  it('bails out entirely if the source already contains the placeholder codepoint', () => {
    // A user's TeX could legitimately contain a private-use codepoint. If it
    // collides with the placeholder, restoration could not tell "was a `|`"
    // from "was already this character", so protection must refuse to run.
    const collision = `| a |\n| --- |\n| $\\text{${PLACEHOLDER}} | x|$ |`;
    expect(protectMathPipes(collision)).toBe(collision);
  });
});

describe('renderMarkdown pipe-protection regressions', () => {
  const texOf = (html: string) =>
    html.match(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/)?.[1] ?? null;

  // Every one of these exercises a construct where the source scanner could
  // disagree with remark about what is math. None may leak the placeholder.
  const leakCases: Record<string, string> = {
    'escaped dollar before pipes': '\\$|x|$',
    'escaped dollar in a table cell': '| a | b |\n| --- | --- |\n| \\$|x|$ | y |',
    'multi-line code span containing math': 'text `foo\n$|x|$\nbar` more',
    'double-backtick code span': 'text ``$|x|$`` more',
    'indented code block': '    $|x|$',
    'unclosed math run': '$foo |x| bar',
    'mismatched dollar runs': '$$a|b$$$',
    'math split by a blank line': '$foo\n\n|x| bar$',
    'pipes in a fenced code block': '```\n$|x|$\n```',
  };

  for (const [name, source] of Object.entries(leakCases)) {
    it(`never leaks the placeholder: ${name}`, () => {
      expect(renderMarkdown(source).html).not.toContain(PLACEHOLDER);
    });
  }

  it('keeps a multi-line code span verbatim, pipes and all', () => {
    const { html } = renderMarkdown('text `foo\n$|x|$\nbar` more');
    expect(html).toContain('$|x|$');
    expect(html).not.toContain(PLACEHOLDER);
  });

  it('renders an escaped dollar as literal text with working table splitting', () => {
    const { html } = renderMarkdown('| a | b |\n| --- | --- |\n| \\$|x|$ | y |');
    expect(html).not.toContain(PLACEHOLDER);
    // The unprotected pipes still split the cell, exactly as GFM prescribes.
    expect(html).toContain('<td>x</td>');
  });

  it('still renders the reported rect(x) table formula', () => {
    const source =
      '| Symbol | Definition |\n' +
      '| --- | --- |\n' +
      '| rect(x) | $\\mathrm{rect}(x) = \\begin{cases} 1 & |x| < 1/2 \\\\ 0 & |x| \\geq 1/2 \\end{cases}$ |';
    const { html } = renderMarkdown(source);

    expect(html).not.toContain('katex-error');
    expect(html).not.toContain(PLACEHOLDER);
    expect(html).toMatch(/<td>[\s\S]*rect[\s\S]*<\/td>\s*<td>[\s\S]*katex[\s\S]*<\/td>/);
    expect(texOf(html)).toContain('|x|');
  });
});
