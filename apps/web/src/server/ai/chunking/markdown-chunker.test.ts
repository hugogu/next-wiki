import { chunkMarkdown } from './markdown-chunker';

describe('Markdown AI chunking', () => {
  it('is deterministic and preserves semantic labels', () => {
    const markdown = '# 标题\n\nSee [guide](https://example.com).\n\n![diagram alt](/x.png)\n\n```ts\nconst value = 1;\n```';
    const first = chunkMarkdown(markdown, 'revision-hash');
    const second = chunkMarkdown(markdown, 'revision-hash');
    expect(second).toEqual(first);
    expect(first.map((chunk) => chunk.contentText).join('\n')).toContain('标题');
    expect(first.map((chunk) => chunk.contentText).join('\n')).toContain('guide');
    expect(first.map((chunk) => chunk.contentText).join('\n')).toContain('diagram alt');
  });

  it('bounds oversized chunks and creates stable unique hashes', () => {
    const chunks = chunkMarkdown(`# Long\n\n${'内容 '.repeat(8_000)}`, 'revision-hash');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.byteCount <= 8_000)).toBe(true);
    expect(new Set(chunks.map((chunk) => chunk.contentHash)).size).toBe(chunks.length);
  });
});
