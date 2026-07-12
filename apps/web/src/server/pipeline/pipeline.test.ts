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

  it('renders Base64-encoded SVG diagram fences as sanitized inline images', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>';
    const source = `\`\`\`diagram\n${Buffer.from(svg).toString('base64')}\n\`\`\``;
    const { html } = renderMarkdown(source);
    const match = html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/);
    const encodedSvg = match?.[1];

    expect(encodedSvg).toBeTruthy();
    expect(html).toContain('alt="Diagram"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('<pre');

    const renderedSvg = Buffer.from(encodedSvg!, 'base64').toString('utf8').toLowerCase();
    expect(renderedSvg).toContain('<rect');
    expect(renderedSvg).not.toContain('<script');
    expect(renderedSvg).not.toContain('onload');
  });

  it('leaves malformed diagram fences as code blocks', () => {
    const { html } = renderMarkdown('```diagram\nnot an SVG\n```');
    expect(html).toContain('<div data-code-block="">');
    expect(html).toContain('not an SVG');
    expect(html).not.toContain('data:image/svg+xml');
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

  it('does not render valid YAML frontmatter as article content', () => {
    const { html } = renderMarkdown('---\ntags: [devops]\nsummary: Hello\n---\n\n# Title');
    expect(html).toContain('Title');
    expect(html).not.toContain('devops');
    expect(html).not.toContain('summary:');
  });
});
