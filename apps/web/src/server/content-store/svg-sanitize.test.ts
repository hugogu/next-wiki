import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from './svg-sanitize';

function clean(svg: string): string {
  const out = sanitizeSvg(Buffer.from(svg));
  expect(out).not.toBeNull();
  return out!.toString('utf8').toLowerCase();
}

describe('sanitizeSvg', () => {
  it('keeps benign vector content', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
        '<rect width="10" height="10" fill="#f00"/><circle cx="5" cy="5" r="3"/>' +
        '</svg>',
    );
    expect(out).toContain('<svg');
    expect(out).toContain('<rect');
    expect(out).toContain('<circle');
  });

  it('removes <script> elements', () => {
    const out = clean('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('removes on* event handler attributes', () => {
    const out = clean('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="x()"/></svg>');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('onclick');
  });

  it('removes <foreignObject> HTML embedding', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>' +
        '<body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(1)"></body>' +
        '</foreignObject></svg>',
    );
    expect(out).not.toContain('foreignobject');
    expect(out).not.toContain('onerror');
  });

  it('drops javascript: and external references but keeps internal #fragment styling', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<a xlink:href="javascript:alert(1)"><rect/></a>' +
        '<image href="https://evil.example/x.svg"/>' +
        '<linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>' +
        '<rect width="10" height="10" fill="url(#grad)"/>' +
        '</svg>',
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('evil.example');
    expect(out).not.toContain('https://');
    // <a> is forbidden entirely; internal gradient references still resolve.
    expect(out).not.toContain('<a');
    expect(out).toContain('id="grad"');
    expect(out).toContain('url(#grad)');
  });

  it('returns null when nothing usable survives', () => {
    expect(sanitizeSvg(Buffer.from('<html><body>not svg</body></html>'))).toBeNull();
    expect(sanitizeSvg(Buffer.from('plain text'))).toBeNull();
  });
});
