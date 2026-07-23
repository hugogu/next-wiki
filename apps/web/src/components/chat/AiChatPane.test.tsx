// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-ai-chat', () => ({
  useAiChat: () => ({
    open: true,
    running: false,
    messages: [],
    setOpen: vi.fn(),
    newSession: vi.fn(),
    cancel: vi.fn(),
    ask: vi.fn(),
  }),
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
  it('renders a maximize control in the normal docked panel', () => {
    const html = renderToStaticMarkup(<AiChatPane entitlements={entitlements} />);
    expect(html).toContain('aria-label="ai.chat.maximize"');
    expect(html).toContain('relative h-full w-[24rem]');
    expect(html).toContain('border-b border-border px-sm py-sm');
    expect(html).toContain('top-full mt-xs right-0');
  });

  it('uses the entire dynamic viewport when maximized', () => {
    expect(aiChatPaneClassName(true)).toContain('fixed inset-0 z-50 h-dvh w-full max-w-none');
    expect(aiChatPaneClassName(false)).toContain('relative h-full w-[24rem]');
  });
});
