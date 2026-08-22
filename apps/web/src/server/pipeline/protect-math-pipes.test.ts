import { describe, expect, it } from 'vitest';
import { protectMathPipes } from './protect-math-pipes';
import { renderMarkdown } from './index';

const PLACEHOLDER = String.fromCharCode(0xe000);

/** Minimal one-column table whose body row holds `cell`. */
const tableWith = (cell: string) => `| h |\n| --- |\n| ${cell} |`;
/** The body row of a protected table, which is where the rewriting happens. */
const protectedRow = (cell: string) => protectMathPipes(tableWith(cell)).split('\n')[2]!;

describe('protectMathPipes', () => {
  it('is a no-op without both `$` and `|`', () => {
    expect(protectMathPipes('plain text')).toBe('plain text');
    expect(protectMathPipes('$x$ only, no pipes')).toBe('$x$ only, no pipes');
    expect(protectMathPipes('a | b, no math')).toBe('a | b, no math');
  });

  it('rewrites nothing outside a table, where a pipe splits no cell', () => {
    // The scanner is not run at all here: a `|` in a paragraph, a link
    // destination or an image title is not a delimiter, so there is nothing to
    // protect — and touching it is how a placeholder ends up somewhere
    // restoration cannot reach.
    for (const source of [
      'a $|x|$ paragraph',
      '[example]($|x|$)',
      '[example](/url "$|x|$")',
      '![$|x|$](/img "$|a|b$")',
      '> quoted $|x|$',
      '- list item $|x|$',
    ]) {
      expect(protectMathPipes(source)).toBe(source);
    }
  });

  it('protects pipes inside a math span but not the table delimiters around it', () => {
    const noPipeInMath = '| A | B |\n| --- | --- |\n| $x$ | plain |';
    expect(protectMathPipes(noPipeInMath)).toBe(noPipeInMath);

    const row = protectMathPipes('| A | B |\n| --- | --- |\n| $|x|$ | plain |').split('\n')[2]!;
    // Only the 3 real cell delimiters stay literal; the 2 inside `$…$` change.
    expect(row.split('|')).toHaveLength(4);
    expect(row).toContain(PLACEHOLDER);
  });

  it('protects the header row too, not just the body', () => {
    const rows = protectMathPipes('| $a|b$ | c |\n| --- | --- |\n| x | y |').split('\n');
    expect(rows[0]).toContain(PLACEHOLDER);
    expect(rows[1]).toBe('| --- | --- |'); // the delimiter row is never touched
  });

  it('treats an escaped dollar as literal, so it never opens a math span', () => {
    // remark-math sees no math here (`\$` is a character escape and the trailing
    // `$` has nothing to pair with), so protecting these pipes would strand
    // placeholders in a plain text node — and would wrongly join two cells.
    expect(protectedRow('\\$|x|$')).toBe('| \\$|x|$ |');
    // An escaped backslash is consumed as its own escape, leaving the `$` free
    // to open a span — matching remark-math.
    expect(protectedRow('a \\\\$|x|$')).toContain(PLACEHOLDER);
  });

  it('does not treat a backslash as escaping a closing delimiter', () => {
    // Verified against remark-math: `$a \$ b$` is math with the body `a \`,
    // i.e. the span ends at the `\$`, not past it.
    const row = protectedRow('$a |b| \\$ c|d|$');
    expect(row).toContain(`a ${PLACEHOLDER}b${PLACEHOLDER} \\`);
    expect(row).toContain('c|d|');
  });

  it('only closes a delimiter run of matching length', () => {
    // `$$…$$$` is not math to remark-math, so nothing should be protected.
    expect(protectedRow('$$a|b$$$')).toBe('| $$a|b$$$ |');
    expect(protectedRow('$$$a|b$$')).toBe('| $$$a|b$$ |');
    expect(protectedRow('$$$a|b$$$')).toContain(PLACEHOLDER);
  });

  it('leaves an unclosed delimiter run alone', () => {
    // A table row is a single line, so a span that does not close on it is not
    // a span at all as far as this row is concerned.
    expect(protectedRow('$foo |x| bar')).toBe('| $foo |x| bar |');
  });

  it('skips code spans of any backtick-run length', () => {
    expect(protectedRow('text `$|x|$` more')).toBe('| text `$|x|$` more |');
    expect(protectedRow('text ``$|x|$`` more')).toBe('| text ``$|x|$`` more |');
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

  // Every one of these is somewhere a placeholder must never appear — either a
  // construct outside any table (which protection must not touch at all), or a
  // table row where the scanner could disagree with remark about what is math.
  const leakCases: Record<string, string> = {
    'link destination': '[example]($|x|$)',
    'link title': '[example](/url "$|x|$")',
    'image alt and title': '![$|x|$](/img "$|a|b$")',
    'footnote definition': 'ref[^1]\n\n[^1]: $|x|$',
    'raw HTML attribute': '<span title="$|x|$">example</span>',
    'raw HTML attribute inside a table cell': '| a |\n| --- |\n| <span title="$|x|$">e</span> |',
    // A URL is percent-encoded on the way out, so a placeholder reaching one
    // does not show up as the literal character.
    'link destination inside a table cell': '| a |\n| --- |\n| [x]($|y|$) |',
    'image title inside a table cell': '| a |\n| --- |\n| ![x](/i "$|y|$") |',
    'escaped dollar before pipes': '\\$|x|$',
    'escaped dollar in a table cell': '| a | b |\n| --- | --- |\n| \\$|x|$ | y |',
    'multi-line code span containing math': 'text `foo\n$|x|$\nbar` more',
    'double-backtick code span': 'text ``$|x|$`` more',
    'code span in a table cell': '| a |\n| --- |\n| `$|x|$` |',
    'indented code block': '    $|x|$',
    // Indentation is treated as a container prefix, so a table written inside
    // an indented code block now looks like a real one to the matcher. It is
    // protected, parsed as `code`, and restored from there.
    'table-shaped indented code block': '    | a |\n    | --- |\n    | $|x|$ |',
    // Verified against remark: this row is not a lazy continuation of the
    // quoted table, it ends the blockquote and becomes its own paragraph. The
    // depth check declines to protect it, which is exactly right.
    'row that leaves the blockquote': '> | a |\n> | --- |\n| $|x|$ |',
    'unclosed math run': '$foo |x| bar',
    'mismatched dollar runs': '$$a|b$$$',
    'math split by a blank line': '$foo\n\n|x| bar$',
    'pipes in a fenced code block': '```\n$|x|$\n```',
    'delimiter-like line that is not a table': 'text\n\n| --- |\n\n$|x|$',
  };

  for (const [name, source] of Object.entries(leakCases)) {
    it(`never leaks the placeholder: ${name}`, () => {
      const { html } = renderMarkdown(source);
      expect(html).not.toContain(PLACEHOLDER);
      // URLs are percent-encoded, so check that spelling of it too.
      expect(html.toUpperCase()).not.toContain(encodeURIComponent(PLACEHOLDER));
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

  // A placeholder the *author* put in the document must survive untouched.
  // These are the two ways one can get there, and neither may be rewritten.
  describe('never rewrites an authored placeholder', () => {
    // Character references are decoded after `protectMathPipes` has scanned the
    // source, so the guard cannot see them — restoration has to stay out of the
    // text positions where they land.
    const entityForms: Record<string, string> = {
      hex: '&#xE000;',
      decimal: '&#57344;',
      'uppercase X': '&#XE000;',
      'leading zeros': '&#x0E000;',
    };

    for (const [name, entity] of Object.entries(entityForms)) {
      it(`preserves an authored character reference (${name})`, () => {
        const { html } = renderMarkdown(`text ${entity} here\n\n| a | b |\n| --- | --- |\n| $|x|$ | y |`);

        expect(html).toContain(PLACEHOLDER); // the author's character, intact
        expect(html).not.toContain('text | here'); // and never turned into a pipe
      });
    }

    it('gives up the table fix rather than risk a document with an authored placeholder', () => {
      // The output check in `renderMarkdown` cannot tell an author's decoded
      // entity from a placeholder restoration missed, so it conservatively
      // falls back to the unprotected render. Same trade as the source guard:
      // one document loses the fix, nothing is ever corrupted.
      const { html } = renderMarkdown('text &#xE000; here\n\n| a | b |\n| --- | --- |\n| $|x|$ | y |');

      expect(html).toContain(PLACEHOLDER);
      expect(html).not.toContain('katex'); // the fix was skipped, not applied
    });

    it('leaves a literal authored placeholder alone by declining to protect', () => {
      // Protection bails out here, so restoration must be skipped too —
      // otherwise it rewrites the author's character into a `|` it never was.
      const { html } = renderMarkdown(`authored ${PLACEHOLDER} char and $|x|$`);
      expect(html).toContain(`authored ${PLACEHOLDER} char`);
    });

    it('leaves a literal authored placeholder inside math alone', () => {
      const { html } = renderMarkdown(`$a ${PLACEHOLDER} b$`);
      // KaTeX rejects the character as invalid TeX, which is the author's
      // problem — ours is only that we must not silently turn it into a pipe.
      expect(html).toContain(PLACEHOLDER);
      expect(html).not.toContain('a | b');
    });
  });

  it('leaves raw HTML outside a table completely untouched', () => {
    const { html } = renderMarkdown('<span title="$|x|$">example</span>');
    expect(html).toContain('title="$|x|$"');
  });

  it('restores pipes in raw HTML inside a table cell, which is protected', () => {
    // Here the scanner does rewrite the attribute, because the line is a table
    // row. `html` nodes are restored for exactly this case — their value is
    // still verbatim source at that stage, entities and all.
    const { html } = renderMarkdown('| a |\n| --- |\n| <span title="$|x|$">e</span> |');
    expect(html).toContain('title="$|x|$"');
  });

  // CommonMark has exactly two container blocks — block quotes and list items
  // — so this enumerates the ways a table can be nested, rather than waiting to
  // discover them one at a time. Each cell holds `$|x|$`.
  const containerCases: Record<string, string> = {
    'blockquote': '> | a |\n> | --- |\n> | $|x|$ |',
    'blockquote, no space after >': '>| a |\n>| --- |\n>| $|x|$ |',
    'nested blockquote': '> > | a |\n> > | --- |\n> > | $|x|$ |',
    'list, table indented under the item': '- item\n\n  | a |\n  | --- |\n  | $|x|$ |',
    'list, table as the first child': '- | a |\n  | --- |\n  | $|x|$ |',
    'list item opening with a blockquote': '- > | a |\n  > | --- |\n  > | $|x|$ |',
    'ordered list item opening with a blockquote': '1. > | a |\n   > | --- |\n   > | $|x|$ |',
    'blockquote containing a list': '> - | a |\n>   | --- |\n>   | $|x|$ |',
    'nested list': '- outer\n  - | a |\n    | --- |\n    | $|x|$ |',
    'table without leading pipes': 'a | b\n--- | ---\nc | $|x|$',
    'blockquoted header holding the math': '> | $a|b$ | c |\n> | --- | --- |\n> | x | y |',
  };

  for (const [name, source] of Object.entries(containerCases)) {
    it(`fixes a table nested in a container: ${name}`, () => {
      const { html } = renderMarkdown(source);
      expect(html).not.toContain(PLACEHOLDER);
      expect(html).toContain('<table');
      expect(texOf(html)).toContain('|');
    });
  }

  it('fixes the reported blockquote-in-a-list case end to end', () => {
    const { html } = renderMarkdown('- > | a |\n  > | --- |\n  > | $|x|$ |');
    expect(html).toContain('<blockquote');
    expect(texOf(html)).toBe('|x|');
  });

  // Everything that ends a table. The trailing construct puts `$|z|$` in a link
  // URL — the most leak-prone spot — so a row scanned past the table's end costs
  // the table its fix. Which lines are rows comes from the parser, so this is a
  // guard on that delegation rather than a list of cases to keep extending.
  const TABLE = '| a | b |\n| --- | --- |\n| $|x|$ | y |';
  const LINK = '[link]($|z|$)';
  const tableEndCases: Record<string, string> = {
    'nested list item': `- ${TABLE.replace(/\n/g, '\n  ')}\n  - ${LINK}`,
    'sibling list item': `- ${TABLE.replace(/\n/g, '\n  ')}\n- ${LINK}`,
    'ordered sibling item': `1. ${TABLE.replace(/\n/g, '\n   ')}\n2. ${LINK}`,
    'blockquote after the table': `${TABLE}\n> ${LINK}`,
    'atx heading after the table': `${TABLE}\n# head ${LINK}`,
    'setext heading after the table': `${TABLE}\n\nhead\n====\n\n${LINK}`,
    'thematic break': `${TABLE}\n***\n${LINK}`,
    'html block': `${TABLE}\n<div>${LINK}</div>`,
    'deeper indented line': `${TABLE}\n    ${LINK}`,
    'list inside a blockquoted table': `> ${TABLE.replace(/\n/g, '\n> ')}\n> - ${LINK}`,
    'blank line': `${TABLE}\n\n${LINK}`,
    'fenced code block': `${TABLE}\n\n\`\`\`\n${LINK}\n\`\`\``,
    'unrelated delimiter row later on': `${TABLE}\n\ntext\n> | --- |\n${LINK}`,
    'table-shaped indented code later': `${TABLE}\n\ntext\n\n    | c |\n    | --- |\n    | $|q|$ |`,
  };

  for (const [name, source] of Object.entries(tableEndCases)) {
    it(`keeps the fix when the table ends at: ${name}`, () => {
      const { html } = renderMarkdown(source);
      expect(html).not.toContain(PLACEHOLDER);
      expect(html.toUpperCase()).not.toContain(encodeURIComponent(PLACEHOLDER));
      expect(texOf(html)).toBe('|x|');
    });
  }

  it('leaves a link that follows a nested list marker untouched', () => {
    const { html } = renderMarkdown(
      '- | a | b |\n  | --- | --- |\n  | $|x|$ | y |\n  - [link]($|z|$)',
    );
    expect(html).toContain('<a href="$%7Cz%7C$"'); // pipes intact, not rewritten
  });

  // Both of these guard machinery that no other test distinguishes: without it
  // an unrelated part of the document triggers the unprotected-render fallback,
  // and a real table silently loses its fix.
  it('keeps the fix when an unrelated delimiter sits at a different depth', () => {
    const { html } = renderMarkdown(
      '| a | b |\n| --- | --- |\n| $|x|$ | y |\n\ntext\n> | --- |\n[a]($|z|$)',
    );
    expect(texOf(html)).toBe('|x|');
  });

  it('keeps the fix when the document also holds a table-shaped indented code block', () => {
    const { html } = renderMarkdown(
      '| a | b |\n| --- | --- |\n| $|x|$ | y |\n\ntext\n\n    | c |\n    | --- |\n    | $|q|$ |',
    );
    expect(texOf(html)).toBe('|x|');
  });

  it('does not treat rows at a different blockquote depth as one table', () => {
    // The header here is outside the quote, so this is not a table and the
    // pipes must be left to split as GFM says.
    const source = '| a |\n> | --- |\n| $|x|$ |';
    expect(renderMarkdown(source).html).not.toContain(PLACEHOLDER);
  });

  it('fixes math with pipes in a table header row', () => {
    // Until the pipes are protected the header's cell count disagrees with the
    // delimiter row, so no table forms at all — asserting on the rendered math
    // alone would pass on a paragraph.
    const { html } = renderMarkdown('| $a|b$ | c |\n| --- | --- |\n| x | y |');
    expect(html).toContain('<table');
    expect(texOf(html)).toBe('a|b');
  });

  it('fixes a header-row formula written with CRLF line endings', () => {
    const { html } = renderMarkdown('| $a|b$ | c |\r\n| --- | --- |\r\n| x | y |');
    expect(html).toContain('<table');
    expect(texOf(html)).toBe('a|b');
  });

  describe('CRLF line endings', () => {
    it('does not get stuck inside a fence, so later content is still fixed', () => {
      // A trailing `\r` used to stop the closing fence from matching, which
      // silently disabled every transform for the rest of the document.
      const source =
        '```\r\ncode\r\n```\r\n\r\n| a | b |\r\n| --- | --- |\r\n| $|x|$ | y |';
      const { html } = renderMarkdown(source);

      expect(html).not.toContain(PLACEHOLDER);
      expect(html).toContain('<table');
      expect(texOf(html)).toContain('|x|');
    });

    it('recognises a CRLF blank line as ending the block', () => {
      // `\r\n\r\n` must terminate the search for a closing `$`, or the scanner
      // protects across a paragraph break the parser honours.
      const { html } = renderMarkdown('$foo\r\n\r\n|x| bar$');
      expect(html).not.toContain(PLACEHOLDER);
    });
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
