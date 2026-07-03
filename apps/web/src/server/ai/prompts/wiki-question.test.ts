import {
  buildWikiQuestionPrompt,
  isInsufficientAnswer,
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

  it('detects explicit or source-free insufficient evidence', () => {
    expect(isInsufficientAnswer('INSUFFICIENT_WIKI_EVIDENCE', sources)).toBe(true);
    expect(isInsufficientAnswer('anything', [])).toBe(true);
  });
});
