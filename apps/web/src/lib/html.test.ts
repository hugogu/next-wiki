import { describe, expect, it } from 'vitest';
import { removeFirstH1 } from './html';

describe('removeFirstH1', () => {
  it('removes the first h1 and leaves the rest intact', () => {
    const html = '<h1 data-line="1">Hello</h1>\n<p>Body</p>';
    expect(removeFirstH1(html)).toBe('\n<p>Body</p>');
  });

  it('returns the original html when no h1 is present', () => {
    const html = '<p>No heading here</p>';
    expect(removeFirstH1(html)).toBe(html);
  });

  it('only removes the first h1', () => {
    const html = '<h1>One</h1><h1>Two</h1>';
    expect(removeFirstH1(html)).toBe('<h1>Two</h1>');
  });
});
