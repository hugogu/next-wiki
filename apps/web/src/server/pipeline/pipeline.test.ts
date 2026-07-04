import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/server/pipeline';

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    const { html, hash } = renderMarkdown('# Hello\n\nWorld');
    expect(html).toContain('<h1 data-line="1">Hello</h1>');
    expect(html).toContain('<p data-line="3">World</p>');
    expect(hash).toHaveLength(64);
  });

  it('renders bold text', () => {
    const { html } = renderMarkdown('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders tables from GFM', () => {
    const { html } = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table data-line="1">');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('wraps fenced code blocks in a copyable container', () => {
    const { html } = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<div data-code-block="">');
    expect(html).toContain('<pre');
    expect(html).toContain('hljs-keyword');
  });

  it('wraps mermaid blocks in a toggleable container', () => {
    const { html } = renderMarkdown('```mermaid\ngraph TD;\n  A-->B;\n```');
    expect(html).toContain('<div data-mermaid-block="">');
    expect(html).toContain('<pre class="mermaid">');
  });

  it('renders inline and block LaTeX math', () => {
    const source = `$E = mc^2$

$$
\\int_0^1 x dx = \\frac12
$$`;
    const { html } = renderMarkdown(source);
    expect(html).toContain('katex');
    expect(html).toContain('E = mc^2');
    expect(html).toContain('katex-display');
  });

  it('marks images for lazy, asynchronous loading', () => {
    const { html } = renderMarkdown('![alt](/api/assets/abc)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('src="/api/assets/abc"');
  });

  it('converts mermaid fenced code blocks into mermaid containers', () => {
    const { html } = renderMarkdown('```mermaid\ngraph TD;\n  A-->B;\n```');
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('graph TD;');
    expect(html).not.toContain('language-mermaid');
  });

  it('marks block-level elements with their 1-indexed source line', () => {
    const { html } = renderMarkdown('# Title\n\nSome text\n\n- item one\n- item two');
    expect(html).toContain('<h1 data-line="1">Title</h1>');
    expect(html).toContain('<p data-line="3">Some text</p>');
    expect(html).toContain('<li data-line="5">item one</li>');
    expect(html).toContain('<li data-line="6">item two</li>');
  });

  it('keeps a data-line attribute on the wrapped <pre> for code blocks', () => {
    const { html } = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<div data-code-block="">');
    expect(html).toMatch(/<pre[^>]*\bdata-line="1"[^>]*>/);
  });

  it('marks table rows with their source line', () => {
    const { html } = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toMatch(/<tr[^>]*\bdata-line="1"[^>]*>/); // header row
    expect(html).toMatch(/<tr[^>]*\bdata-line="3"[^>]*>/); // data row
  });
});
