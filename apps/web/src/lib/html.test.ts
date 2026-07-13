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

  it('reuses existing id attributes', () => {
    const html = '<h2 id="custom-id">Section</h2><h3>Subsection</h3>';
    expect(extractHeadings(html)).toEqual([
      { level: 2, text: 'Section', id: 'custom-id' },
      { level: 3, text: 'Subsection', id: 'subsection' },
    ]);
  });

  it('reuses ids injected by injectHeadingIds', () => {
    const html = '<h2>目录</h2><h3>太阳系</h3>';
    const injected = injectHeadingIds(html);
    expect(extractHeadings(injected)).toEqual([
      { level: 2, text: '目录', id: '目录' },
      { level: 3, text: '太阳系', id: '太阳系' },
    ]);
  });

  it('is not affected by repeated invocations (regex state isolation)', () => {
    const html = '<h2>First</h2><h2>Second</h2>';
    extractHeadings(html);
    extractHeadings(html);
    expect(extractHeadings(html)).toEqual([
      { level: 2, text: 'First', id: 'first' },
      { level: 2, text: 'Second', id: 'second' },
    ]);
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

  it('regenerates generic fallback ids', () => {
    const html = '<h2 id="heading">目录</h2>';
    expect(injectHeadingIds(html)).toBe('<h2 id="目录">目录</h2>');
  });

  it('ignores h1', () => {
    const html = '<h1>Title</h1>';
    expect(injectHeadingIds(html)).toBe(html);
  });

  it('gives repeated headings unique ids so anchors stay distinct', () => {
    const html = '<h2>概述</h2><h2>概述</h2><h3>概述</h3>';
    expect(injectHeadingIds(html)).toBe('<h2 id="概述">概述</h2><h2 id="概述-2">概述</h2><h3 id="概述-3">概述</h3>');
  });

  it('avoids colliding a generated id with an existing one', () => {
    const html = '<h2 id="intro">A</h2><h2>Intro</h2>';
    expect(injectHeadingIds(html)).toBe('<h2 id="intro">A</h2><h2 id="intro-2">Intro</h2>');
  });

  it('produces outline ids that match the injected DOM ids for duplicates', () => {
    const injected = injectHeadingIds('<h2>Notes</h2><h2>Notes</h2>');
    expect(extractHeadings(injected).map((h) => h.id)).toEqual(['notes', 'notes-2']);
  });
});
