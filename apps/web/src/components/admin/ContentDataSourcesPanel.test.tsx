import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContentDataSourceItem } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ApiProvider } from '@/lib/api/provider';
import { ContentDataSourcesPanel } from './ContentDataSourcesPanel';

function renderWithI18n(children: React.ReactNode): string {
  return renderToStaticMarkup(
    <ApiProvider>
      <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
        {children}
      </ApplicationI18nProvider>
    </ApiProvider>,
  );
}

function item(overrides: Partial<ContentDataSourceItem> = {}): ContentDataSourceItem {
  return {
    sourceKey: 'ai-conversations',
    category: 'content',
    label: 'AI Conversations',
    description: 'Capture every AI conversation — Wiki AI and Feishu bot — as Raw Conversation pages.',
    enabled: false,
    available: true,
    unavailableReason: null,
    updatedAt: '2026-07-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('ContentDataSourcesPanel', () => {
  it('renders the localized label/description and an unchecked switch when disabled', () => {
    const html = renderWithI18n(<ContentDataSourcesPanel initial={[item({ enabled: false })]} />);
    expect(html).toContain('AI Conversations');
    expect(html).toContain('Capture every AI conversation');
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('Unavailable');
  });

  it('renders a checked switch when the source is enabled', () => {
    const html = renderWithI18n(<ContentDataSourcesPanel initial={[item({ enabled: true })]} />);
    expect(html).toContain('aria-checked="true"');
  });

  it('shows the unavailable badge, reason, and a disabled switch when unavailable', () => {
    const html = renderWithI18n(
      <ContentDataSourcesPanel
        initial={[item({ enabled: false, available: false, unavailableReason: 'Raw content requires LLM Wiki writing mode' })]}
      />,
    );
    expect(html).toContain('Unavailable');
    expect(html).toContain('Raw content requires LLM Wiki writing mode.');
    expect(html).toMatch(/role="switch"[^>]*\sdisabled=""/);
  });

  it('keeps an already-enabled source switch usable even if it later becomes unavailable', () => {
    const html = renderWithI18n(<ContentDataSourcesPanel initial={[item({ enabled: true, available: false })]} />);
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toMatch(/role="switch"[^>]*\sdisabled=""/);
  });

  it('falls back to server-provided copy for an unregistered future source', () => {
    const html = renderWithI18n(
      <ContentDataSourcesPanel
        initial={[
          item({
            sourceKey: 'future-source' as ContentDataSourceItem['sourceKey'],
            label: 'Future Source',
            description: 'A source not yet known to the UI copy table.',
          }),
        ]}
      />,
    );
    expect(html).toContain('Future Source');
    expect(html).toContain('A source not yet known to the UI copy table.');
  });
});
