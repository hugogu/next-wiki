import { describe, expect, it } from 'vitest';
import { pathSchema } from './pages';

describe('pathSchema', () => {
  it('accepts underscores inside path segments', () => {
    expect(pathSchema.parse('docs/api_v2')).toBe('docs/api_v2');
  });

  it('keeps existing canonical path boundaries', () => {
    for (const path of ['_docs', 'docs_', 'docs//api', 'Docs/api']) {
      expect(pathSchema.safeParse(path).success).toBe(false);
    }
  });
});
