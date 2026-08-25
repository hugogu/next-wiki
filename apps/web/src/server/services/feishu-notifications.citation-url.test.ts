import type { AiCitation, WikiCitation } from '@next-wiki/shared';
import { toFeishuCitations } from './feishu-notifications';

function citation(overrides: Partial<WikiCitation>): AiCitation {
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
 * must link to the canonical public prefix (`/{space}/...`) — a bare
 * APP_URL + path previously produced a broken link for anything outside the
 * wiki space (e.g. a captured Conversation page cited from a follow-up question).
 */
describe('toFeishuCitations (citation URL space-correctness)', () => {
  it('links a wiki-space citation at the site root', () => {
    const [result] = toFeishuCitations([citation({ path: 'docs/deploy' })]);
    expect(result?.url).toBe('http://localhost:3000/docs/deploy');
  });

  it('links a raw-space citation under /raw/... instead of a bare root path', () => {
    const [result] = toFeishuCitations([
      citation({ path: 'conversations/feishu/2026/07/21/action-1', spaceSlug: 'raw' }),
    ]);
    expect(result?.url).toBe('http://localhost:3000/raw/conversations/feishu/2026/07/21/action-1');
  });

  it('links a generated-space citation under /generated/...', () => {
    const [result] = toFeishuCitations([citation({ path: 'concepts/rrf', spaceSlug: 'generated' })]);
    expect(result?.url).toBe('http://localhost:3000/generated/concepts/rrf');
  });

  it('keeps a web citation on the source canonical URL', () => {
    const [result] = toFeishuCitations([{
      kind: 'web', sourceId: '00000000-0000-4000-8000-000000000003', title: 'External guide',
      canonicalUrl: 'https://docs.example.com/guide', provider: 'tavily', retrievedAt: '2026-08-25T00:00:00.000Z',
    }]);
    expect(result?.url).toBe('https://docs.example.com/guide');
  });
});
