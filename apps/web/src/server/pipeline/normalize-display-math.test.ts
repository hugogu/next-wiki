import { describe, expect, it } from 'vitest';
import { normalizeDisplayMath } from './normalize-display-math';
import { renderMarkdown } from './index';

const MATRIX_INLINE_DELIMS = `$$\\Sigma = \\begin{bmatrix}
\\sigma_1^2 & \\sigma_{12} \\\\
\\sigma_{21} & \\sigma_2^2
\\end{bmatrix}$$`;

describe('normalizeDisplayMath', () => {
  it('isolates the delimiters of a multi-line block with inline delimiters', () => {
    expect(normalizeDisplayMath(MATRIX_INLINE_DELIMS)).toBe(
      `$$
\\Sigma = \\begin{bmatrix}
\\sigma_1^2 & \\sigma_{12} \\\\
\\sigma_{21} & \\sigma_2^2
\\end{bmatrix}
$$`,
    );
  });

  it('leaves a block that already has delimiters on their own lines unchanged', () => {
    const already = `$$
a + b
$$`;
    expect(normalizeDisplayMath(already)).toBe(already);
  });

  it('leaves single-line $$…$$ untouched', () => {
    const single = 'text $$a^2 + b^2$$ more text';
    expect(normalizeDisplayMath(single)).toBe(single);
  });

  it('does not touch $$ inside a fenced code block', () => {
    const fenced = ['```md', '$$x = 1', 'y = 2$$', '```'].join('\n');
    expect(normalizeDisplayMath(fenced)).toBe(fenced);
  });

  it('handles several blocks and surrounding prose', () => {
    const src = ['before', '$$x^2', '+ 1$$', 'middle', '$$', 'y', '$$', 'after'].join('\n');
    expect(normalizeDisplayMath(src)).toBe(
      ['before', '$$', 'x^2\n+ 1', '$$', 'middle', '$$', 'y', '$$', 'after'].join('\n'),
    );
  });

  it('is a no-op when there is no display math', () => {
    const src = 'just prose with an inline $x$ and a `code $$span$$`';
    expect(normalizeDisplayMath(src)).toBe(src);
  });
});

describe('renderMarkdown display-math regression', () => {
  const texOf = (html: string) =>
    html.match(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/)?.[1] ?? null;

  it('renders a multi-line matrix with inline $$ delimiters without error', () => {
    const { html } = renderMarkdown(MATRIX_INLINE_DELIMS);
    expect(html).not.toContain('katex-error');
    expect(html).toContain('katex-display');
    expect(texOf(html)).toContain('\\begin{bmatrix}');
    expect(texOf(html)).toContain('\\sigma_1^2');
  });

  it('still renders a single-line $$…$$ block', () => {
    const { html } = renderMarkdown('$$\\sigma_p^2 = (0.6)^2 (0.20)^2$$');
    expect(html).not.toContain('katex-error');
    expect(texOf(html)).toContain('\\sigma_p^2');
  });

  it('keeps math delimiters literal inside a code fence', () => {
    const { html } = renderMarkdown('```\n$$x = 1\ny = 2$$\n```');
    expect(html).not.toContain('katex');
    expect(html).toContain('$$x = 1');
  });
});
