import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const searchPage = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const publicLayout = readFileSync(new URL('../layout.tsx', import.meta.url), 'utf8');
const readerPage = readFileSync(new URL('../[...path]/page.tsx', import.meta.url), 'utf8');

describe('semantic search page', () => {
  it('does not inherit static prerendering intended only for published readers', () => {
    expect(publicLayout).not.toContain("dynamic = 'force-static'");
    expect(searchPage).not.toContain("dynamic = 'force-static'");
    expect(readerPage).toContain("dynamic = 'force-static'");
  });
});
