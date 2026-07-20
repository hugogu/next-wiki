// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/server/pipeline/index';
import { parsePlottableTex } from './tex-to-plot';

/**
 * End-to-end seam: real KaTeX output (produced by the server pipeline) must
 * carry a TeX annotation that `parsePlottableTex` — the exact predicate the
 * client uses to decide whether to show a plot icon — can consume.
 */
function plottableFormulas(markdown: string): string[] {
  const { html } = renderMarkdown(markdown);
  const container = document.createElement('div');
  container.innerHTML = html;
  const result: string[] = [];
  container.querySelectorAll('.katex').forEach((node) => {
    const tex = node
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent?.trim();
    if (tex && parsePlottableTex(tex)) result.push(tex);
  });
  return result;
}

describe('math plot decoration seam', () => {
  it('recognizes plottable inline and display math from KaTeX output', () => {
    const md = [
      'Inline quadratic $x^2 - 2x + 1$ and the logistic',
      '',
      '$$f(x) = \\frac{1}{1 + e^{-x}}$$',
      '',
      'A trig curve $\\sin(x)$.',
    ].join('\n');

    expect(plottableFormulas(md)).toEqual([
      'x^2 - 2x + 1',
      'f(x) = \\frac{1}{1 + e^{-x}}',
      '\\sin(x)',
    ]);
  });

  it('leaves non-plottable math undecorated', () => {
    const md = [
      'A constant $\\pi$ and a matrix',
      '',
      '$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$',
      '',
      'Two variables $x + y$ and a sum $\\sum_{i=1}^{n} i$.',
    ].join('\n');

    expect(plottableFormulas(md)).toEqual([]);
  });
});
