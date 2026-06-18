import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/server/pipeline';

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    const { html, hash } = renderMarkdown('# Hello\n\nWorld');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>World</p>');
    expect(hash).toHaveLength(64);
  });

  it('renders bold text', () => {
    const { html } = renderMarkdown('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders tables from GFM', () => {
    const { html } = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('applies syntax highlighting to fenced code blocks', () => {
    const { html } = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('language-js');
    expect(html).toContain('hljs');
    expect(html).toContain('hljs-keyword');
  });
});
