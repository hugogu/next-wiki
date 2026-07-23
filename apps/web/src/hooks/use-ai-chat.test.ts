import {
  buildConversationContext,
  buildToolEnabledQuestionPayload,
  wikiAiErrorTranslationKey,
} from './use-ai-chat';
import type { ChatMessage } from '@/components/chat/chat-store';

describe('useAiChat payload helpers', () => {
  it('builds bounded conversation context from completed user/assistant turns', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', text: 'What did we decide?' },
      { id: 'a1', role: 'assistant', text: 'We decided to use tool-enabled questions.' },
      { id: 'u2', role: 'user', text: 'This pending turn is ignored.' },
    ];

    expect(buildConversationContext(messages)).toEqual([
      { question: 'What did we decide?', answer: 'We decided to use tool-enabled questions.' },
    ]);
  });

  it('sends Wiki AI follow-up turns as tool-enabled requests with prior answer context', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', text: 'Summarize the design.' },
      { id: 'a1', role: 'assistant', text: 'The design is a governed tool runtime.' },
    ];

    expect(buildToolEnabledQuestionPayload({
      question: 'Write the above into a standalone wiki page.',
      mode: 'retrieval',
      sessionId: '00000000-0000-4000-8000-000000000026',
      messages,
    })).toEqual({
      question: 'Write the above into a standalone wiki page.',
      mode: 'retrieval',
      sessionId: '00000000-0000-4000-8000-000000000026',
      currentPage: undefined,
      conversation: [
        {
          question: 'Summarize the design.',
          answer: 'The design is a governed tool runtime.',
        },
      ],
      tools: { enabled: true, requestedReview: 'admin_review' },
    });
  });

  it('maps provider and tool-plan failures to user-facing messages instead of a generic internal error', () => {
    expect(wikiAiErrorTranslationKey({
      code: 'INVALID_RESPONSE',
      message: 'The AI provider repeatedly returned an invalid tool call.',
    })).toBe('ai.chat.errors.invalidResponse');
    expect(wikiAiErrorTranslationKey({ code: 'PROVIDER_UNAVAILABLE' }))
      .toBe('ai.chat.errors.providerUnavailable');
    expect(wikiAiErrorTranslationKey({ message: 'AI request failed' }))
      .toBe('ai.chat.errors.requestFailed');
  });
});
