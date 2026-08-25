import { renderToStaticMarkup } from 'react-dom/server';
import type { AiCitation, WikiCitation } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ChatCitations } from './ChatCitations';

function render(citations?: AiCitation[], actionId?: string): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <ChatCitations citations={citations} actionId={actionId} />
    </ApplicationI18nProvider>,
  );
}

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

describe('ChatCitations', () => {
  it('renders nothing for an empty or missing citations list', () => {
    expect(render([])).toBe('');
    expect(render()).toBe('');
  });

  it('links a wiki-space citation at the site root (absent spaceSlug treated as wiki)', () => {
    const html = render([citation({ path: 'docs/deploy' })]);
    expect(html).toContain('href="/docs/deploy"');
  });

  it('links a raw-space citation under /raw/... instead of a bare root path (bug fix)', () => {
    const html = render([citation({ path: 'conversations/feishu/2026/07/21/action-1', spaceSlug: 'raw' })]);
    expect(html).toContain('href="/raw/conversations/feishu/2026/07/21/action-1"');
    expect(html).not.toContain('href="/conversations/feishu/2026/07/21/action-1"');
  });

  it('links a generated-space citation under /generated/...', () => {
    const html = render([citation({ path: 'concepts/rrf', spaceSlug: 'generated' })]);
    expect(html).toContain('href="/generated/concepts/rrf"');
  });

  it('renders an external citation as a labelled safe outbound link', () => {
    const html = render([{
      kind: 'web', sourceId: '00000000-0000-4000-8000-000000000003', title: 'External guide',
      canonicalUrl: 'https://docs.example.com/guide', provider: 'tavily', retrievedAt: '2026-08-25T00:00:00.000Z',
    }]);
    expect(html).toContain('External:');
    expect(html).toContain('External guide');
    expect(html).toContain('href="https://docs.example.com/guide"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it('offers an explicit Preserve control only when the answer action is available', () => {
    const citation = {
      kind: 'web' as const, sourceId: '00000000-0000-4000-8000-000000000003', title: 'External guide',
      canonicalUrl: 'https://docs.example.com/guide', provider: 'tavily', retrievedAt: '2026-08-25T00:00:00.000Z',
    };
    expect(render([citation])).not.toContain('Preserve');
    expect(render([citation], '00000000-0000-4000-8000-000000000004')).toContain('Preserve');
  });
});
