import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiToolListResponse } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';

// AiToolsPanel reads router/query state; a static render only needs no-op stubs.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/ai/tools',
  useSearchParams: () => new URLSearchParams(),
}));

import { AiToolsPanel } from './AiToolsPanel';

const data: AiToolListResponse = {
  providers: [
    {
      key: 'next-wiki',
      displayName: 'next-wiki',
      kind: 'builtin_wiki',
      enabled: true,
      activationStatus: 'available',
    },
    {
      key: 'external-mcp',
      displayName: 'External MCP',
      kind: 'external_mcp',
      enabled: false,
      activationStatus: 'future_external',
    },
  ],
  tools: [
    {
      providerKey: 'next-wiki',
      name: 'search_wiki',
      category: 'read',
      riskLevel: 'read',
      requiredScope: 'read',
      enabled: true,
      reviewPolicy: 'review_when_requested',
      resultRetention: 'raw_when_durable',
      effectiveReview: 'none',
      description: 'Search wiki pages.',
    },
    {
      providerKey: 'next-wiki',
      name: 'rename_tag',
      category: 'tag',
      riskLevel: 'reviewed_write',
      requiredScope: 'manage_tags',
      enabled: true,
      reviewPolicy: 'always_review',
      resultRetention: 'never_full_result',
      effectiveReview: 'admin_review',
      description: 'Rename a tag.',
    },
  ],
};

function render(): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <AiToolsPanel initial={data} />
    </ApplicationI18nProvider>,
  );
}

describe('AiToolsPanel', () => {
  it('lists the built-in provider and both tool rows', () => {
    const html = render();
    expect(html).toContain('next-wiki');
    expect(html).toContain('search_wiki');
    expect(html).toContain('rename_tag');
  });

  it('shows the future external-provider disabled state', () => {
    const html = render();
    expect(html).toContain('External MCP providers are not available in this phase.');
  });

  it('renders a review-policy editor for a mutating tool and no editor for a read tool', () => {
    const html = render();
    // The mutating tool exposes the "always review" option in its policy select.
    expect(html).toContain('Always review');
    expect(html).toContain('Review when requested');
    // The read tool shows the no-review effective state, not a select.
    expect(html).toContain('No review');
  });
});
