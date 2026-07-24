// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const chatState = vi.hoisted(() => ({
  newSession: vi.fn(),
}));

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn(() => new Promise(() => {})),
}));

vi.mock('./chat-store', () => ({
  useChatStore: () => chatState,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import { AiChatHistory } from './AiChatHistory';

describe('AiChatHistory', () => {
  it('renders the history panel in its loading state', () => {
    const html = renderToStaticMarkup(<AiChatHistory />);
    expect(html).toContain('ai.chat.history.title');
    expect(html).toContain('common.status.loading');
  });
});
