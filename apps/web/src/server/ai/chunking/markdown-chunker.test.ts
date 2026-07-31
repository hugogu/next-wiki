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

  it('does not emit a heading plus one short line as its own chunk', () => {
    // Regression: a captured conversation began with `## Question` followed by
    // the question, producing a 22-byte chunk that was an embedding of the
    // question and nothing else — a cosine-1.0 match for the same question
    // asked again, carrying nothing that could answer it.
    // The exact shape a capture is written in: an empty `# Answer` heading
    // sits between the question and the body.
    const body = 'The answer body is long enough to stand on its own. '.repeat(12);
    const chunks = chunkMarkdown(
      `# Question\n\nIntroduce LLM\n\n# Answer\n\n## Overview\n\n${body}`,
      'revision-hash',
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.contentText).toContain('Introduce LLM');
    expect(chunks[0]!.contentText).toContain('The answer body');
    expect(chunks.some((chunk) => chunk.contentText.trim() === 'Question\nIntroduce LLM')).toBe(false);
  });

  it('keeps every heading of a folded-in section, not just its deepest one', () => {
    const body = 'Substantial section content that comfortably clears the floor. '.repeat(6);
    const chunks = chunkMarkdown(
      `# Outer\n\n## Inner\n\nTiny.\n\n# Later\n\n${body}`,
      'revision-hash',
    );

    const merged = chunks[0]!.contentText;
    expect(merged).toContain('Outer / Inner');
    expect(merged).toContain('Tiny.');
    // The absorbing section's own heading survives exactly once, as the prefix.
    expect(merged.match(/Later/g)).toHaveLength(1);
    expect(chunks[0]!.headingPath).toEqual(['Later']);
  });

  it('keeps a trailing short section with the chunk before it', () => {
    const body = 'Substantial section content that comfortably clears the floor. '.repeat(6);
    const chunks = chunkMarkdown(`# Main\n\n${body}\n\n## Note\n\nShort tail.`, 'revision-hash');

    expect(chunks.at(-1)!.contentText).toContain('Short tail.');
    expect(chunks.every((chunk) => chunk.byteCount > 60)).toBe(true);
  });

  it('still indexes a page that is entirely shorter than the floor', () => {
    const chunks = chunkMarkdown('# Stub\n\nOne line.', 'revision-hash');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.contentText).toContain('One line.');
  });
});
