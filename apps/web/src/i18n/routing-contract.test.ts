import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const proxySource = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8');

describe('UI localization routing contract', () => {
  it('does not add locale routing or rewrite content-translation URLs', () => {
    expect(proxySource).not.toMatch(/next-intl\/middleware|defineRouting|createNavigation/);
    expect(proxySource).not.toMatch(/rewrites\s*[:=]|redirects\s*[:=]/);
    expect(proxySource).toMatch(/source:\s*['"]\/\(\(\?!api/);
  });
});
