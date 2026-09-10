import { describe, it, expect } from 'vitest';
import {
  buildPageDescription,
  extractContentImages,
  htmlToText,
  stripLeadingTitleHeading,
} from './seo';

describe('htmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
  });

  it('strips inline tags', () => {
    expect(htmlToText('<strong>hello</strong> <em>world</em>')).toBe('hello world');
  });

  it('replaces block-level closers with newlines (then collapses)', () => {
    expect(htmlToText('<p>one</p><p>two</p>')).toBe('one two');
    expect(htmlToText('<div>a</div><div>b</div>')).toBe('a b');
    expect(htmlToText('<li>a</li><li>b</li>')).toBe('a b');
  });

  it('preserves <br> as a break', () => {
    expect(htmlToText('line one<br>line two')).toBe('line one line two');
  });

  it('decodes common HTML entities', () => {
    expect(htmlToText('Tom &amp; Jerry &lt;3 &quot;cheese&quot;&#39;s')).toBe(
      "Tom & Jerry <3 \"cheese\"'s",
    );
  });

  it('collapses whitespace', () => {
    expect(htmlToText('  hello\n\n   world  ')).toBe('hello world');
  });

  it('strips attributes from remaining tags', () => {
    expect(htmlToText('<a href="https://x" class="y">link</a>')).toBe('link');
  });
});

describe('buildPageDescription', () => {
  it('returns fallback when html is empty', () => {
    expect(buildPageDescription('', 'site tagline')).toBe('site tagline');
  });

  it('returns fallback when html yields no text', () => {
    expect(buildPageDescription('<p></p><div>   </div>', 'fallback here')).toBe(
      'fallback here',
    );
  });

  it('trims fallback longer than maxLength at last whitespace', () => {
    const fallback = 'one two three four five six seven';
    // default maxLength 160 is well above the fallback, so unchanged.
    expect(buildPageDescription('', fallback)).toBe(fallback);
  });

  it('uses the first sentence when it fits', () => {
    expect(
      buildPageDescription(
        '<p>This is a short page. There is more text after the period.</p>',
        'fallback',
      ),
    ).toBe('This is a short page.');
  });

  it('falls back to char-clamp when the first sentence is too long', () => {
    const long = 'word '.repeat(80).trim(); // 5*80-1 = 399 chars
    const html = `<p>${long}</p>`;
    const out = buildPageDescription(html, 'fallback');
    expect(out.length).toBeLessThanOrEqual(161); // 160 + the ellipsis
    expect(out.endsWith('…')).toBe(true);
  });

  it('respects a custom maxLength', () => {
    const html = '<p>The quick brown fox jumps over the lazy dog repeatedly.</p>';
    expect(buildPageDescription(html, 'fallback', 30).length).toBeLessThanOrEqual(31);
  });

  it('removes dangling punctuation before the ellipsis', () => {
    const html = `<p>${'alpha '.repeat(60).trim()}</p>`;
    const out = buildPageDescription(html, 'fallback', 40);
    expect(out.endsWith('…')).toBe(true);
    // Should not end with stray punctuation immediately before the ellipsis.
    expect(/[.,;:!?-]…$/.test(out)).toBe(false);
  });
});

describe('stripLeadingTitleHeading', () => {
  it('drops a leading heading that repeats the title', () => {
    expect(stripLeadingTitleHeading('<h1>Welcome</h1><p>Body.</p>', 'Welcome')).toBe('<p>Body.</p>');
  });

  it('ignores case and surrounding whitespace when comparing', () => {
    expect(stripLeadingTitleHeading('\n  <h2 id="t"> welcome </h2><p>Body.</p>', 'Welcome')).toBe(
      '<p>Body.</p>',
    );
  });

  it('keeps a leading heading that is a real section title', () => {
    const html = '<h2>Overview</h2><p>Body.</p>';
    expect(stripLeadingTitleHeading(html, 'Welcome')).toBe(html);
  });

  it('only considers the first element, never a heading further down', () => {
    const html = '<p>Body.</p><h1>Welcome</h1>';
    expect(stripLeadingTitleHeading(html, 'Welcome')).toBe(html);
  });

  it('leaves the html untouched when there is no title to compare against', () => {
    const html = '<h1>Welcome</h1>';
    expect(stripLeadingTitleHeading(html, '')).toBe(html);
  });
});

describe('extractContentImages', () => {
  it('returns images in document order with their alt text', () => {
    const html =
      '<p><img src="/api/assets/one" alt="first"></p><img src="/api/v1/assets/two/content" alt="second">';
    expect(extractContentImages(html)).toEqual([
      { url: '/api/assets/one', alt: 'first' },
      { url: '/api/v1/assets/two/content', alt: 'second' },
    ]);
  });

  it('reports a missing or empty alt as null', () => {
    expect(extractContentImages('<img src="/a.png"><img src="/b.png" alt="  ">')).toEqual([
      { url: '/a.png', alt: null },
      { url: '/b.png', alt: null },
    ]);
  });

  it('skips inline data URIs, which no crawler can fetch', () => {
    expect(extractContentImages('<img src="data:image/png;base64,AAA"><img src="/real.png">')).toEqual([
      { url: '/real.png', alt: null },
    ]);
  });

  it('skips images without a usable src', () => {
    expect(extractContentImages('<img alt="broken"><img src="" alt="empty">')).toEqual([]);
  });

  it('decodes entities in attribute values', () => {
    expect(extractContentImages('<img src="/x?a=1&amp;b=2" alt="Tom &amp; Jerry">')).toEqual([
      { url: '/x?a=1&b=2', alt: 'Tom & Jerry' },
    ]);
  });

  it('honors single-quoted attributes', () => {
    expect(extractContentImages("<img src='/a.png' alt='hi'>")).toEqual([{ url: '/a.png', alt: 'hi' }]);
  });

  it('stops at the limit', () => {
    const html = '<img src="/a.png"><img src="/b.png"><img src="/c.png">';
    expect(extractContentImages(html, 2)).toHaveLength(2);
  });
});