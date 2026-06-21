import { performance } from 'node:perf_hooks';
import { chunkMarkdown } from './chunking/markdown-chunker';
import { estimateFullContextTokens } from './retrieval/full-context';
import type { QuestionSource } from './prompts/wiki-question';

describe('AI benchmark fixtures', () => {
  it('chunks a representative 100-page corpus within a bounded local budget', () => {
    const page = '# Architecture\n\n' + 'PostgreSQL vector retrieval and permission checks. '.repeat(500);
    const started = performance.now();
    const chunks = Array.from({ length: 100 }, (_, index) => chunkMarkdown(page, `revision-${index}`)).flat();
    expect(chunks.length).toBeGreaterThan(100);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('estimates full-context capacity without loading provider SDKs', () => {
    const sources: QuestionSource[] = Array.from({ length: 100 }, (_, index) => ({
      id: `S${index + 1}`,
      pageId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      revisionId: `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`,
      title: `Page ${index + 1}`,
      path: `page-${index + 1}`,
      locale: 'en',
      revisionHash: `hash-${index + 1}`,
      content: 'Representative Wiki content. '.repeat(100),
    }));
    expect(estimateFullContextTokens('question', sources)).toBeGreaterThan(10_000);
  });
});
