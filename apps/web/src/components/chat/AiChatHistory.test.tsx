// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const chatState = vi.hoisted(() => ({
  newSession: vi.fn(),
  restoreSession: vi.fn(),
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

vi.mock('./reconstruct-session', () => ({
  reconstructSessionFromEvents: vi.fn(() => ({
    question: 'What is Wiki?',
    answer: 'A wiki is a collaborative website.',
    thinking: '',
    citations: [],
    toolCalls: [],
    searchResults: [],
    insufficient: false,
    errorMessage: null,
  })),
}));

import { AiChatHistory } from './AiChatHistory';

describe('AiChatHistory', () => {
  it('renders the history panel in its loading state', () => {
    const html = renderToStaticMarkup(<AiChatHistory />);
    expect(html).toContain('ai.chat.history.title');
    expect(html).toContain('common.status.loading');
  });
});
