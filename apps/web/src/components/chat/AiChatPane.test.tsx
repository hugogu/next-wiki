// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const chatState = vi.hoisted(() => ({
  open: true,
  running: false,
  messages: [] as Array<{
    id: string;
    role: 'user' | 'assistant';
    text: string;
    error?: string;
    searchResults?: { title: string; path: string; spaceSlug?: string }[];
  }>,
  setOpen: vi.fn(),
  newSession: vi.fn(),
  cancel: vi.fn(),
  ask: vi.fn(),
}));
vi.mock('@/hooks/use-ai-chat', () => ({
  useAiChat: () => chatState,
}));
vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./chat-store', () => ({
  useChatStore: { persist: { rehydrate: vi.fn() }, getState: vi.fn() },
}));
vi.mock('./reconstruct-session', () => ({
  reconstructSessionFromEvents: vi.fn((events: Array<{ type?: string; payload?: { text?: string } }>) => {
    const question = events?.find((e) => e.type === 'question')?.payload?.text ?? 'Unknown';
    return {
      question,
      answer: `A:${question}`,
      thinking: '',
      citations: [],
      toolCalls: [],
      searchResults: [],
      insufficient: false,
      errorMessage: null,
    };
  }),
  recoverSessionFromServer: vi.fn(),
}));

import { AiChatPane, aiChatPaneClassName, shouldPersistAnonymousChatSnapshot } from './AiChatPane';
import { buildMessagesFromDetail } from './load-conversation';

const entitlements = {
  userId: '00000000-0000-4000-8000-000000000001',
  aiEnabled: true,
  questionAnsweringEnabled: true,
  textOptimizationEnabled: false,
  imageGenerationEnabled: false,
  webResearchEnabled: false,
  webResearchPreference: false,
  webResearchAvailable: false,
  reasons: [],
};

describe('AiChatPane viewport modes', () => {
  beforeEach(() => {
    chatState.running = false;
    chatState.messages = [];
  });

  it('renders a maximize control in the normal docked panel', () => {
    const html = renderToStaticMarkup(<AiChatPane entitlements={entitlements} />);
    expect(html).toContain('aria-label="ai.chat.maximize"');
    expect(html).toContain('relative h-full w-[var(--ai-chat-width)]');
    expect(html).toContain('style="--ai-chat-width:384px"');
    expect(html).toContain('border-b border-border px-sm py-sm');
    expect(html).toContain('title="ai.chat.newSession"');
  });

  it('uses the entire dynamic viewport when maximized', () => {
    expect(aiChatPaneClassName(true)).toContain('relative h-full w-full flex-1 max-w-none');
    expect(aiChatPaneClassName(false)).toContain('relative h-full w-[var(--ai-chat-width)]');
  });

  it('shows the generating placeholder only on the latest assistant turn', () => {
    chatState.running = true;
    chatState.messages = [
      { id: 'user-1', role: 'user', text: 'First question' },
      { id: 'assistant-1', role: 'assistant', text: '', error: 'Previous request failed' },
      { id: 'user-2', role: 'user', text: 'Second question' },
      { id: 'assistant-2', role: 'assistant', text: '', searchResults: [{ title: 'Payments', path: 'concepts/payments' }] },
    ];

    const html = renderToStaticMarkup(<AiChatPane entitlements={entitlements} />);

    expect(html.match(/ai\.chat\.streaming/g)).toHaveLength(1);
    expect(html).toContain('Previous request failed');
  });

  it('shows the retrieving placeholder before the search_results event arrives', () => {
    chatState.running = true;
    chatState.messages = [
      { id: 'user-1', role: 'user', text: 'First question' },
      { id: 'assistant-1', role: 'assistant', text: '' },
    ];

    const html = renderToStaticMarkup(<AiChatPane entitlements={entitlements} />);

    expect(html).toContain('ai.chat.retrieving');
    expect(html).not.toContain('ai.chat.streaming');
  });

  it('renders the retrieval summary once search results arrive', () => {
    chatState.running = true;
    chatState.messages = [
      { id: 'user-1', role: 'user', text: 'First question' },
      {
        id: 'assistant-1',
        role: 'assistant',
        text: '',
        searchResults: [{ title: 'Payments', path: 'concepts/payments' }],
      },
    ];

    const html = renderToStaticMarkup(<AiChatPane entitlements={entitlements} />);

    expect(html).toContain('ai.chat.retrievedPages');
    expect(html).toContain('Payments');
    expect(html).toContain('ai.chat.streaming');
  });
});

describe('anonymous chat persistence', () => {
  it('does not persist each streamed message delta', () => {
    expect(shouldPersistAnonymousChatSnapshot({
      anonymous: true,
      rehydrated: true,
      running: true,
      messageCount: 2,
    })).toBe(false);
    expect(shouldPersistAnonymousChatSnapshot({
      anonymous: true,
      rehydrated: true,
      running: false,
      messageCount: 2,
    })).toBe(true);
  });
});

describe('buildMessagesFromDetail', () => {
  it('reverses newest-first turns into oldest-first chat messages', () => {
    const detail = {
      conversation: { conversationKey: 'legacy:test' },
      turns: [
        {
          action: { questionMode: 'retrieval' },
          events: [{ type: 'question', payload: { text: 'Second' } }],
        },
        {
          action: { questionMode: 'retrieval' },
          events: [{ type: 'question', payload: { text: 'First' } }],
        },
      ],
    } as unknown as import('@next-wiki/shared').AiConversationDetail;

    const messages = buildMessagesFromDetail(detail);

    expect(messages).toHaveLength(4);
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.text).toBe('First');
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.text).toBe('A:First');
    expect(messages[2]!.role).toBe('user');
    expect(messages[2]!.text).toBe('Second');
    expect(messages[3]!.role).toBe('assistant');
    expect(messages[3]!.text).toBe('A:Second');
  });

  it('falls back to the captured snapshot once the event log has been purged', () => {
    const detail = {
      conversation: {
        conversationKey: 'legacy:expired',
        rawConversation: {
          pageId: 'page-1',
          path: 'conversations/wiki-ai/2026/07/26/abc',
          url: '/raw/conversations/wiki-ai/2026/07/26/abc',
          captureStatus: 'captured',
          conversation: {
            status: 'completed',
            question: 'Second',
            answer: 'A:Second',
            thinking: '',
            citations: [],
            insufficient: false,
            errorMessage: null,
            turns: [
              { status: 'completed', question: 'First', answer: 'A:First', thinking: '', citations: [], insufficient: false, errorMessage: null },
              { status: 'completed', question: 'Second', answer: 'A:Second', thinking: '', citations: [], insufficient: false, errorMessage: null },
            ],
          },
        },
      },
      // Retention purged the events; the turns themselves still list.
      turns: [
        { action: { questionMode: 'retrieval' }, events: [] },
        { action: { questionMode: 'retrieval' }, events: [] },
      ],
    } as unknown as import('@next-wiki/shared').AiConversationDetail;

    const messages = buildMessagesFromDetail(detail);

    expect(messages.map((message) => message.text)).toEqual(['First', 'A:First', 'Second', 'A:Second']);
  });

  it('prefers the live event log over the snapshot while events survive', () => {
    const detail = {
      conversation: {
        conversationKey: 'legacy:live',
        rawConversation: {
          pageId: 'page-1',
          path: 'conversations/wiki-ai/2026/07/26/abc',
          url: '/raw/conversations/wiki-ai/2026/07/26/abc',
          captureStatus: 'captured',
          conversation: {
            status: 'completed',
            question: 'Stale snapshot',
            answer: 'A:Stale snapshot',
            thinking: '',
            citations: [],
            insufficient: false,
            errorMessage: null,
          },
        },
      },
      turns: [{ action: { questionMode: 'retrieval' }, events: [{ type: 'question', payload: { text: 'Live' } }] }],
    } as unknown as import('@next-wiki/shared').AiConversationDetail;

    expect(buildMessagesFromDetail(detail).map((message) => message.text)).toEqual(['Live', 'A:Live']);
  });
});
