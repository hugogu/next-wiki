import { describe, expect, it } from 'vitest';
import { convertHtml } from './html';
import { convertMarkdown } from './markdown';

describe('Wiki.js content converters', () => {
  it('preserves Markdown verbatim', () => {
    expect(convertMarkdown('# Exact\n')).toEqual({ markdown: '# Exact\n', converted: false });
  });

  it('converts supported HTML and removes active content', () => {
    const result = convertHtml('<h1>Hello</h1><script>alert(1)</script><p onclick="x()">World</p>');
    expect(result.converted).toBe(true);
    expect(result.markdown).toContain('# Hello');
    expect(result.markdown).toContain('World');
    expect(result.markdown).not.toContain('alert');
    expect(result.markdown).not.toContain('onclick');
  });
});
