import { describe, it, expect } from 'vitest';
import { buildPageDescription, htmlToText } from './seo';

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