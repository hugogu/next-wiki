import type { AiCitation } from '@next-wiki/shared';
import { toFeishuCitations } from './feishu-notifications';

function citation(overrides: Partial<AiCitation>): AiCitation {
  return {
    pageId: '00000000-0000-4000-8000-000000000001',
    title: 'Guide',
    path: 'guide',
    locale: 'en',
    revisionId: '00000000-0000-4000-8000-000000000002',
    revisionHash: 'hash',
    ...overrides,
  };
}

/**
 * Regression test: a Feishu card citation for a raw/generated-space page
 * must link to /spaces/{space}/... — a bare APP_URL + path previously
 * produced a broken link for anything outside the wiki space (e.g. a
 * captured Conversation page cited from a follow-up question).
 */
describe('toFeishuCitations (citation URL space-correctness)', () => {
  it('links a wiki-space citation at the site root', () => {
    const [result] = toFeishuCitations([citation({ path: 'docs/deploy' })]);
    expect(result?.url).toBe('http://localhost:3000/docs/deploy');
  });

  it('links a raw-space citation under /spaces/raw/... instead of a bare root path', () => {
    const [result] = toFeishuCitations([
      citation({ path: 'conversations/feishu/2026/07/21/action-1', spaceSlug: 'raw' }),
    ]);
    expect(result?.url).toBe('http://localhost:3000/spaces/raw/conversations/feishu/2026/07/21/action-1');
  });

  it('links a generated-space citation under /spaces/generated/...', () => {
    const [result] = toFeishuCitations([citation({ path: 'concepts/rrf', spaceSlug: 'generated' })]);
    expect(result?.url).toBe('http://localhost:3000/spaces/generated/concepts/rrf');
  });
});
