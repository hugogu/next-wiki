import { describe, expect, it } from 'vitest';
import { aiCitationSchema, aiQuestionInputSchema, researchModeSchema } from './ai';

describe('web research shared contracts', () => {
  it('accepts the two explicit research modes and a consented question request', () => {
    expect(researchModeSchema.options).toEqual(['wiki_only', 'wiki_first_web']);
    expect(aiQuestionInputSchema.parse({
      question: 'What changed this week?',
      mode: 'retrieval',
      research: { mode: 'wiki_first_web', externalResearchConsent: true },
    }).research).toEqual({ mode: 'wiki_first_web', externalResearchConsent: true });
  });

  it('continues parsing historical Wiki citations and discriminates web citations', () => {
    expect(aiCitationSchema.parse({
      pageId: '00000000-0000-4000-8000-000000000001', title: 'Guide', path: 'guide', locale: 'en',
      revisionId: '00000000-0000-4000-8000-000000000002', revisionHash: 'hash',
    })).toMatchObject({ pageId: '00000000-0000-4000-8000-000000000001' });
    expect(aiCitationSchema.parse({
      kind: 'web', sourceId: '00000000-0000-4000-8000-000000000003', title: 'External guide',
      canonicalUrl: 'https://docs.example.com/guide', provider: 'tavily', retrievedAt: '2026-08-25T00:00:00.000Z',
      contentHash: 'a'.repeat(64),
    })).toMatchObject({ kind: 'web', provider: 'tavily' });
  });
});
