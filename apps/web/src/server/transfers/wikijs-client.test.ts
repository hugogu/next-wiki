import { describe, expect, it } from 'vitest';
import { computeWikiJsPageFingerprint, wikiJsTagNames } from './wikijs-client';

describe('Wiki.js tag mapping', () => {
  it('uses display titles and removes blank or case-only duplicates', () => {
    expect(wikiJsTagNames([
      { tag: 'devops', title: 'DevOps' },
      { tag: 'docker' },
      ' devops ',
      ' ',
    ])).toEqual(['DevOps', 'docker']);
  });

  it('includes canonical tag identifiers in the page fingerprint', () => {
    const base = { id: 1, path: 'docs/a', locale: 'en', title: 'A', updatedAt: '2026-07-12' };
    const first = computeWikiJsPageFingerprint({ ...base, tags: ['devops'] });
    const same = computeWikiJsPageFingerprint({ ...base, tags: [{ tag: 'DEVOPS', title: 'Platform' }] });
    const changed = computeWikiJsPageFingerprint({ ...base, tags: ['docker'] });
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });
});
