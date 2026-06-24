import { describe, it, expect } from 'vitest';
import { DomainError } from '@/server/errors';
import { sanitizeThemeCss, scopeThemeCss, THEME_SCOPE } from '@/server/appearance/css-sanitize';

describe('sanitizeThemeCss', () => {
  it('keeps allowlisted typography/layout properties', () => {
    const out = sanitizeThemeCss('h1 { font-size: 2rem; margin: 1rem; line-height: 1.2; }');
    expect(out).toContain('font-size: 2rem');
    expect(out).toContain('margin: 1rem');
    expect(out).toContain('line-height: 1.2');
  });

  it('strips color and background declarations', () => {
    const out = sanitizeThemeCss('p { color: red; background-color: blue; font-weight: 700; }');
    expect(out).not.toContain('color');
    expect(out).not.toContain('background');
    expect(out).toContain('font-weight: 700');
  });

  it('strips remote url() and @import', () => {
    const out = sanitizeThemeCss('@import url("http://evil.test/x.css"); h1 { background: url(http://evil.test/i.png); font-size: 1rem; }');
    expect(out.toLowerCase()).not.toContain('@import');
    expect(out.toLowerCase()).not.toContain('url(');
    expect(out).toContain('font-size: 1rem');
  });

  it('allows border geometry but not border color shorthands', () => {
    const out = sanitizeThemeCss('blockquote { border-left-width: 3px; border-left-style: solid; border-left: 3px solid red; border-color: red; }');
    expect(out).toContain('border-left-width: 3px');
    expect(out).toContain('border-left-style: solid');
    expect(out).not.toContain('border-left:');
    expect(out).not.toContain('border-color');
  });

  it('rejects oversized stylesheets', () => {
    expect(() => sanitizeThemeCss('h1{font-size:1rem;}'.repeat(2000))).toThrow(DomainError);
  });
});

describe('scopeThemeCss', () => {
  it('prefixes every selector with the content-root scope', () => {
    const out = scopeThemeCss('h1 { font-size: 2rem; }\nblockquote { font-style: italic; }');
    expect(out).toContain(`${THEME_SCOPE} h1`);
    expect(out).toContain(`${THEME_SCOPE} blockquote`);
  });
});
