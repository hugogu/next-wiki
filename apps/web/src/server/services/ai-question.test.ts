import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import { assertFullContextCapacity, estimateFullContextTokens } from '@/server/ai/retrieval/full-context';

const source = (id: string, content: string): QuestionSource => ({
  id,
  pageId: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
  revisionId: `00000000-0000-4000-9000-${id.padStart(12, '0')}`,
  title: id,
  path: id,
  locale: 'en',
  revisionHash: id,
  content,
});

describe('full-context capacity', () => {
  it('uses a conservative deterministic estimate without truncation', () => {
    const sources = [source('1', 'a'.repeat(3_000)), source('2', '中文'.repeat(500))];
    expect(estimateFullContextTokens('question', sources)).toBe(estimateFullContextTokens('question', sources));
    expect(() => assertFullContextCapacity(100_000, 'question', sources)).not.toThrow();
    expect(() => assertFullContextCapacity(1_000, 'question', sources)).toThrowError(
      expect.objectContaining({ code: 'FULL_CONTEXT_TOO_LARGE' }),
    );
  });

  it('rejects unknown model capacity', () => {
    expect(() => assertFullContextCapacity(null, 'question', [source('1', 'body')])).toThrowError(
      expect.objectContaining({ code: 'FULL_CONTEXT_TOO_LARGE' }),
    );
  });
});
