import {
  buildWikiQuestionPrompt,
  compressQuestionSources,
  computeAnswerMaxOutputTokens,
  estimatePromptTokens,
  normalizeQuestionCitations,
  type QuestionSource,
} from './wiki-question';

const sources: QuestionSource[] = [
  {
    id: 'S1',
    pageId: '00000000-0000-4000-8000-000000000001',
    revisionId: '00000000-0000-4000-8000-000000000002',
    title: 'Guide',
    path: 'guide',
    locale: 'en',
    revisionHash: 'hash',
    content: 'Grounded content',
  },
];

describe('Wiki question prompts', () => {
  it('uses stable source ids and removes unknown citations', () => {
    const prompt = buildWikiQuestionPrompt('What?', sources);
    expect(prompt.user).toContain('id="S1"');
    expect(normalizeQuestionCitations('Answer [S1] [S9] [S1]', sources)).toEqual([
      expect.objectContaining({ pageId: sources[0]!.pageId }),
    ]);
  });

  it('recognizes full-width bracket markers (【S1】) some models substitute in CJK answers', () => {
    expect(normalizeQuestionCitations('答案【S1】。', sources)).toEqual([
      expect.objectContaining({ pageId: sources[0]!.pageId }),
    ]);
  });

  it('allows a useful general-knowledge fallback without inventing citations', () => {
    const prompt = buildWikiQuestionPrompt('Who is Guan Yu?', []);
    expect(prompt.system).toContain('answer helpfully from general model knowledge');
    expect(prompt.system).not.toContain('INSUFFICIENT_WIKI_EVIDENCE');
    expect(normalizeQuestionCitations('Guan Yu was a Han dynasty general.', [])).toEqual([]);
  });
});

describe('computeAnswerMaxOutputTokens', () => {
  it('caps a bogus per-model output limit that equals the whole context window', () => {
    // A model that reports maxOutputTokens == contextWindow must not request the
    // entire window as output, or input + output overflows and the request 400s.
    const maxOut = computeAnswerMaxOutputTokens(4180, 262144, 262144);
    expect(maxOut).toBe(8192);
    expect(maxOut).toBeLessThan(262144 - 4180);
  });

  it('leaves room for the prompt on a small context window', () => {
    // 4096-window model with a large prompt: output must fit what remains.
    expect(computeAnswerMaxOutputTokens(3000, 4096, null)).toBe(4096 - 3000 - 512);
  });

  it('never returns less than the floor', () => {
    expect(computeAnswerMaxOutputTokens(10_000, 8192, null)).toBe(512);
  });

  it('respects a smaller honest per-model output cap', () => {
    expect(computeAnswerMaxOutputTokens(1000, 128000, 2048)).toBe(2048);
  });
});

describe('compressQuestionSources', () => {
  it('halves each source body and keeps citation ids stable', () => {
    const big: QuestionSource[] = [{ ...sources[0]!, content: 'x'.repeat(1000) }];
    const compressed = compressQuestionSources(big);
    expect(compressed).toHaveLength(1);
    expect(compressed[0]!.id).toBe('S1');
    expect(compressed[0]!.content.length).toBeLessThanOrEqual(500);
  });

  it('drops sources that compress away to nothing', () => {
    const tiny: QuestionSource[] = [{ ...sources[0]!, content: ' ' }];
    expect(compressQuestionSources(tiny)).toEqual([]);
  });
});

describe('estimatePromptTokens', () => {
  it('approximates four characters per token', () => {
    expect(estimatePromptTokens('a'.repeat(40), 'b'.repeat(40))).toBe(20);
  });
});
