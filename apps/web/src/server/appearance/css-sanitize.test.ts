import { describe, it, expect } from 'vitest';
import { DomainError } from '@/server/errors';
import { sanitizeSystemThemeCss } from '@/server/appearance/css-sanitize';

describe('sanitizeSystemThemeCss', () => {
  it('keeps allowlisted layout, typography, and border geometry', () => {
    const out = sanitizeSystemThemeCss(
      '.header { display: flex; gap: 1rem; padding: 0.5rem; border-bottom-width: 1px; border-bottom-style: solid; } h1 { font-size: 2rem; line-height: 1.2; }',
    );
    expect(out).toContain('display: flex');
    expect(out).toContain('gap: 1rem');
    expect(out).toContain('font-size: 2rem');
    expect(out).toContain('border-bottom-width: 1px');
  });

  it('strips color and background declarations', () => {
    const out = sanitizeSystemThemeCss(
      'p { color: red; background-color: blue; font-weight: 700; }',
    );
    expect(out).not.toContain('color');
    expect(out).not.toContain('background');
    expect(out).toContain('font-weight: 700');
  });

  it('strips remote url() and @import', () => {
    const out = sanitizeSystemThemeCss(
      '@import url("http://evil.test/x.css"); .x { background: url(http://evil.test/i.png); padding: 1rem; }',
    );
    expect(out.toLowerCase()).not.toContain('@import');
    expect(out.toLowerCase()).not.toContain('url(');
    expect(out).toContain('padding: 1rem');
  });

  it('keeps @keyframes but strips color declarations inside them', () => {
    const out = sanitizeSystemThemeCss(
      '@keyframes pulse { 0% { opacity: 0.4; color: red; } 100% { opacity: 1; } }',
    );
    expect(out).toContain('@keyframes');
    expect(out).toContain('opacity: 0.4');
    expect(out).not.toContain('color');
  });

  it('rejects oversized stylesheets', () => {
    expect(() => sanitizeSystemThemeCss('h1{font-size:1rem;}'.repeat(5000))).toThrow(DomainError);
  });

  it('rejects invalid CSS', () => {
    expect(() => sanitizeSystemThemeCss('this is not css }}}')).toThrow(DomainError);
  });

  it('keeps token (var) colors and content but strips hardcoded colors', () => {
    const out = sanitizeSystemThemeCss(
      'blockquote::before { content: "Q"; background-color: var(--color-muted); color: var(--color-surface); } .x { background: #fff; color: rgb(0,0,0); }',
    );
    expect(out).toContain('content:');
    expect(out).toContain('background-color: var(--color-muted)');
    expect(out).toContain('color: var(--color-surface)');
    expect(out).not.toContain('#fff');
    expect(out).not.toContain('rgb(');
  });

  it('allows flex/grid alignment properties', () => {
    const out = sanitizeSystemThemeCss(
      '.x { display: flex; align-items: center; justify-content: center; gap: 1rem; }',
    );
    expect(out).toContain('align-items: center');
    expect(out).toContain('justify-content: center');
  });
});
