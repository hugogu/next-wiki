import { describe, expect, it } from 'vitest';
import { readerReferencePath } from './reader-reference';

describe('readerReferencePath', () => {
  it.each([
    ['https://kb.hugogu.cn/generated/ten-theses-ai-future-2026?x=1#section', '/generated/ten-theses-ai-future-2026'],
    ['/raw/notes/', '/raw/notes'],
    ['wiki/zh/article', '/wiki/zh/article'],
    ['/custom-prefix/old-address', '/custom-prefix/old-address'],
    ['/wiki/%E4%B8%AD%E6%96%87', '/wiki/%E4%B8%AD%E6%96%87'],
  ])('normalizes %s', (input, expected) => {
    expect(readerReferencePath(input, 'https://kb.hugogu.cn/api/v1')).toBe(expected);
  });
  it.each(['https://other.example/wiki/a', 'javascript:alert(1)', '//other.example/a',
    'https://user:pass@kb.hugogu.cn/wiki/a', '/', '/wiki/a%2Fb', '/wiki/%', '/wiki/a%5Cb', '/wiki/a%00b'])('rejects %s', (input) => {
    expect(() => readerReferencePath(input, 'https://kb.hugogu.cn')).toThrow();
  });
});
