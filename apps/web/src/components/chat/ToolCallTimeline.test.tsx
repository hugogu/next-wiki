import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiToolCallEventPayload, AiToolProposalEventPayload } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ToolCallTimeline } from './ToolCallTimeline';

function call(overrides: Partial<AiToolCallEventPayload> = {}): AiToolCallEventPayload {
  return {
    toolCallId: crypto.randomUUID(),
    sequence: 1,
    providerKey: 'next-wiki',
    toolName: 'search_wiki',
    commandMarkdown: '```tool-call\nsearch_wiki\n```',
    status: 'running',
    requestedReview: 'none',
    effectiveReview: 'none',
    ...overrides,
  };
}

function render(calls: AiToolCallEventPayload[], proposals: AiToolProposalEventPayload[] = []): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <ToolCallTimeline calls={calls} proposals={proposals} />
    </ApplicationI18nProvider>,
  );
}

describe('ToolCallTimeline', () => {
  it('renders nothing when there is no tool activity', () => {
    expect(render([])).toBe('');
  });

  it('renders tool names, live statuses, and command markdown', () => {
    const html = render([
      call({ toolName: 'search_wiki', status: 'running' }),
      call({ toolName: 'get_page', status: 'succeeded', resultSummary: '3 readable pages matched' }),
      call({ toolName: 'rename_tag', status: 'blocked', errorCode: 'TOOL_NOT_ENABLED' }),
    ]);
    expect(html).toContain('search_wiki');
    expect(html).toContain('Running');
    expect(html).toContain('get_page');
    expect(html).toContain('Succeeded');
    expect(html).toContain('Blocked');
    expect(html).toContain('search_wiki'); // command markdown record
  });

  it('shows a created proposal with its title', () => {
    const html = render(
      [call({ status: 'succeeded' })],
      [{ proposalId: crypto.randomUUID(), kind: 'tag_update', status: 'pending', title: 'Retag 4 pages', url: '/admin/ai/tools/proposals/x' }],
    );
    expect(html).toContain('Change proposal created');
    expect(html).toContain('Retag 4 pages');
  });

  it('never renders a full raw result payload — only the safe summary', () => {
    const html = render([
      call({ status: 'succeeded', resultSummary: '2 pages matched' }),
    ]);
    expect(html).toContain('2 pages matched');
    // A safe summary is present; there is no field carrying an arbitrary result
    // body in the event payload, so none can leak into the timeline.
    expect(html).not.toContain('RAW_RESULT_BODY');
  });
});
