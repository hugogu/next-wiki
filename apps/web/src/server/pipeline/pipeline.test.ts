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

  it('is deterministic for the same source', () => {
    const a = renderMarkdown('same');
    const b = renderMarkdown('same');
    expect(a.hash).toBe(b.hash);
    expect(a.html).toBe(b.html);
  });
});
