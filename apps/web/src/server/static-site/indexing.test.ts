import { describe, expect, it } from 'vitest';
import { markNonIndexableContent } from './indexing';

describe('markNonIndexableContent', () => {
  it('excludes mermaid source from the index', () => {
    const html = '<div data-mermaid-block=""><pre class="mermaid">graph TD; A--&gt;B;</pre></div>';
    expect(markNonIndexableContent(html)).toContain('data-pagefind-ignore');
  });

  it("excludes KaTeX's hidden LaTeX copy but keeps the visual rendering", () => {
    const html =
      '<span class="katex"><span class="katex-mathml">\\frac{1}{3}</span><span class="katex-html">1/3</span></span>';
    const output = markNonIndexableContent(html);
    expect(output).toContain('<span class="katex-mathml" data-pagefind-ignore>');
    expect(output).toContain('<span class="katex-html">');
  });

  it('leaves ordinary prose untouched', () => {
    const html = '<p>Installation requires pnpm.</p>';
    expect(markNonIndexableContent(html)).toBe(html);
  });

  it('does not double-mark content that is already excluded', () => {
    const html = '<div data-pagefind-ignore data-mermaid-block=""><pre>x</pre></div>';
    expect(markNonIndexableContent(html).match(/data-pagefind-ignore/g)).toHaveLength(1);
  });
});
