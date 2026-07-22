import { renderToStaticMarkup } from 'react-dom/server';
import type { AiCitation } from '@next-wiki/shared';
import { ChatCitations } from './ChatCitations';

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

describe('ChatCitations', () => {
  it('renders nothing for an empty or missing citations list', () => {
    expect(renderToStaticMarkup(<ChatCitations citations={[]} />)).toBe('');
    expect(renderToStaticMarkup(<ChatCitations />)).toBe('');
  });

  it('links a wiki-space citation at the site root (absent spaceSlug treated as wiki)', () => {
    const html = renderToStaticMarkup(<ChatCitations citations={[citation({ path: 'docs/deploy' })]} />);
    expect(html).toContain('href="/docs/deploy"');
  });

  it('links a raw-space citation under /spaces/raw/... instead of a bare root path (bug fix)', () => {
    const html = renderToStaticMarkup(
      <ChatCitations citations={[citation({ path: 'conversations/feishu/2026/07/21/action-1', spaceSlug: 'raw' })]} />,
    );
    expect(html).toContain('href="/spaces/raw/conversations/feishu/2026/07/21/action-1"');
    expect(html).not.toContain('href="/conversations/feishu/2026/07/21/action-1"');
  });

  it('links a generated-space citation under /spaces/generated/...', () => {
    const html = renderToStaticMarkup(<ChatCitations citations={[citation({ path: 'concepts/rrf', spaceSlug: 'generated' })]} />);
    expect(html).toContain('href="/spaces/generated/concepts/rrf"');
  });
});
