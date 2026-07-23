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
  useChatStore: { persist: { rehydrate: vi.fn() } },
}));

import { AiChatPane, aiChatPaneClassName } from './AiChatPane';

const entitlements = {
  userId: '00000000-0000-4000-8000-000000000001',
  aiEnabled: true,
  questionAnsweringEnabled: true,
  textOptimizationEnabled: false,
  imageGenerationEnabled: false,
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
    expect(html).toContain('relative h-full w-[24rem]');
    expect(html).toContain('border-b border-border px-sm py-sm');
    expect(html).toContain('title="ai.chat.newSession"');
  });

  it('uses the entire dynamic viewport when maximized', () => {
    expect(aiChatPaneClassName(true)).toContain('fixed inset-0 z-50 h-dvh w-full max-w-none');
    expect(aiChatPaneClassName(false)).toContain('relative h-full w-[24rem]');
  });

  it('shows the generating placeholder only on the latest assistant turn', () => {
    chatState.running = true;
    chatState.messages = [
      { id: 'user-1', role: 'user', text: 'First question' },
      { id: 'assistant-1', role: 'assistant', text: '', error: 'Previous request failed' },
      { id: 'user-2', role: 'user', text: 'Second question' },
      { id: 'assistant-2', role: 'assistant', text: '' },
    ];

    const html = renderToStaticMarkup(<AiChatPane entitlements={entitlements} />);

    expect(html.match(/ai\.chat\.streaming/g)).toHaveLength(1);
    expect(html).toContain('Previous request failed');
  });
});
