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

  it('rewrites reference-style Markdown links', () => {
    const { html } = renderMarkdown('[Child][child]\n\n[child]: ./child.md', {
      resolveMarkdownLink: (href) => href === './child.md' ? '/raw/child' : null,
    });
    expect(html).toContain('<a href="/raw/child">Child</a>');
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

  it('renders safe raw HTML images from Markdown', () => {
    const { html } = renderMarkdown(
      '<img align="middle" src="https://latex.codecogs.com/svg.image?f^n(x)%20%3D%20f(x)" title="f^n(x) = f(x)" />',
    );
    expect(html).toContain('<img');
    expect(html).toContain('align="middle"');
    expect(html).toContain('src="https://latex.codecogs.com/svg.image?f^n(x)%20%3D%20f(x)"');
    expect(html).toContain('title="f^n(x) = f(x)"');
    expect(html).toContain('loading="lazy"');
  });

  it('sanitizes unsafe raw HTML image content', () => {
    const { html } = renderMarkdown('<img src="javascript:alert(1)" onerror="alert(2)"><script>alert(3)</script>');
    expect(html).toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
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

  it('renders a wikilink as a link, addressed from the site root by default', () => {
    const { html } = renderMarkdown('- 补充: [[ops/multi-registry]] 说明原因。');
    expect(html).toContain('<a href="/ops/multi-registry">ops/multi-registry</a>');
    expect(html).toContain('<li data-line="1">');
  });

  it('renders a wikilink alias and heading fragment', () => {
    const { html } = renderMarkdown('[[docs/setup|Setup guide]] and [[docs/setup#install]]');
    expect(html).toContain('<a href="/docs/setup">Setup guide</a>');
    expect(html).toContain('<a href="/docs/setup#install">docs/setup#install</a>');
  });

  it('resolves wikilinks through the supplied resolver', () => {
    const { html } = renderMarkdown('[[ops/foo]]', {
      resolveWikiLink: (link) => `/generated/knowledge/${link.target}`,
    });
    expect(html).toContain('<a href="/generated/knowledge/ops/foo">ops/foo</a>');
  });

  it('resolves ordinary Markdown links through the supplied resolver', () => {
    const { html } = renderMarkdown('[Related page](../sources/related.md#details)', {
      resolveMarkdownLink: (href) => href === '../sources/related.md#details' ? '/raw/memory/sources/related#details' : null,
    });
    expect(html).toContain('<a href="/raw/memory/sources/related#details">Related page</a>');
  });

  it('leaves ordinary Markdown links unchanged when the resolver declines them', () => {
    const { html } = renderMarkdown('[External](https://example.com/page.md)', {
      resolveMarkdownLink: () => null,
    });
    expect(html).toContain('<a href="https://example.com/page.md">External</a>');
  });

  it('leaves wikilink syntax alone inside code', () => {
    const { html } = renderMarkdown('`[[ops/foo]]`\n\n```\n[[ops/bar]]\n```');
    expect(html).toContain('<code>[[ops/foo]]</code>');
    expect(html).toContain('[[ops/bar]]');
    expect(html).not.toContain('<a href="/ops/');
  });

  it('does not nest a wikilink inside a Markdown link', () => {
    const { html } = renderMarkdown('[[[ops/foo]]](/elsewhere)');
    expect(html).toContain('href="/elsewhere"');
    expect(html).not.toContain('href="/ops/foo"');
  });

  it('does not render valid YAML frontmatter as article content', () => {
    const { html } = renderMarkdown('---\ntags: [devops]\nsummary: Hello\n---\n\n# Title');
    expect(html).toContain('Title');
    expect(html).not.toContain('devops');
    expect(html).not.toContain('summary:');
  });
});
