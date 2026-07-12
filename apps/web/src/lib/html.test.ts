import { describe, expect, it } from 'vitest';
import { extractHeadings, injectHeadingIds } from './html';

describe('extractHeadings', () => {
  it('collects h2-h6 and ignores h1', () => {
    const html = '<h1>Title</h1><h2>Section A</h2><p>text</p><h3>Subsection</h3>';
    expect(extractHeadings(html)).toEqual([
      { level: 2, text: 'Section A', id: 'section-a' },
      { level: 3, text: 'Subsection', id: 'subsection' },
    ]);
  });

  it('strips inline html from heading text', () => {
    const html = '<h2><em>Italic</em> Title</h2>';
    expect(extractHeadings(html)).toEqual([{ level: 2, text: 'Italic Title', id: 'italic-title' }]);
  });

  it('decodes html entities', () => {
    const html = '<h2>Foo &amp; Bar</h2>';
    expect(extractHeadings(html)).toEqual([{ level: 2, text: 'Foo & Bar', id: 'foo-bar' }]);
  });

  it('returns an empty array when no headings exist', () => {
    expect(extractHeadings('<p>No headings</p>')).toEqual([]);
  });
});

describe('injectHeadingIds', () => {
  it('adds ids to headings without them', () => {
    const html = '<h2>Section</h2>';
    expect(injectHeadingIds(html)).toBe('<h2 id="section">Section</h2>');
  });

  it('preserves existing ids', () => {
    const html = '<h2 id="custom">Section</h2>';
    expect(injectHeadingIds(html)).toBe(html);
  });

  it('ignores h1', () => {
    const html = '<h1>Title</h1>';
    expect(injectHeadingIds(html)).toBe(html);
  });
});
