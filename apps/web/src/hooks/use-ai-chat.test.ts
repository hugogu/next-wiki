import { webcrypto } from 'node:crypto';
import type { ChatMessage } from '@/components/chat/chat-store';

vi.stubGlobal('crypto', webcrypto);

const {
  buildConversationContext,
  buildToolEnabledQuestionPayload,
  startWikiQuestionAction,
  wikiAiErrorTranslationKey,
} = await import('./use-ai-chat');

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

  it('retains a failed tool turn so a retry keeps the original request context', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', text: '写一篇《股票作手回忆录》的读书笔记并保存到 Wiki。' },
      { id: 'a1', role: 'assistant', text: '', error: 'The AI request failed.' },
    ];

    expect(buildConversationContext(messages)).toEqual([
      {
        question: '写一篇《股票作手回忆录》的读书笔记并保存到 Wiki。',
        answer: expect.stringContaining('did not produce a usable final answer'),
      },
    ]);
  });

  it('does not keep a bare tool protocol as if it were an assistant answer', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', text: '创建笔记。' },
      { id: 'a1', role: 'assistant', text: 'tool_calls:\n  - tool: search_wiki\n    arguments: {}' },
    ];

    expect(buildConversationContext(messages)[0]?.answer).toContain('did not produce a usable final answer');
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

  it('retries once without a stale current-page context', async () => {
    const start = vi.fn()
      .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'Current page not found' })
      .mockResolvedValueOnce({
        id: 'action-1',
        feature: 'wiki_question',
        status: 'queued',
        eventsUrl: '/api/ai/actions/action-1/events',
      });
    const payload = buildToolEnabledQuestionPayload({
      question: 'Continue',
      mode: 'retrieval',
      sessionId: '00000000-0000-4000-8000-000000000026',
      currentPage: {
        pageId: '00000000-0000-4000-8000-000000000001',
        revisionId: '00000000-0000-4000-8000-000000000002',
      },
      messages: [],
    });

    await startWikiQuestionAction(start, payload, () => undefined);

    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1]?.[1]).toEqual({ ...payload, currentPage: undefined });
  });

  it('maps provider and tool-plan failures to user-facing messages instead of a generic internal error', () => {
    expect(wikiAiErrorTranslationKey({
      code: 'INVALID_RESPONSE',
      message: 'The AI provider repeatedly returned an invalid tool call.',
    })).toBe('ai.chat.errors.invalidResponse');
    expect(wikiAiErrorTranslationKey({ code: 'PROVIDER_UNAVAILABLE' }))
      .toBe('ai.chat.errors.providerUnavailable');
    expect(wikiAiErrorTranslationKey({ code: 'NETWORK_ERROR' }))
      .toBe('ai.chat.errors.connectionFailed');
    expect(wikiAiErrorTranslationKey({ code: 'TIMEOUT' }))
      .toBe('ai.chat.errors.timeout');
    expect(wikiAiErrorTranslationKey({ code: 'UNAUTHORIZED' }))
      .toBe('ai.chat.errors.sessionExpired');
    expect(wikiAiErrorTranslationKey({ code: 'BAD_REQUEST' }))
      .toBe('ai.chat.errors.invalidRequest');
    expect(wikiAiErrorTranslationKey({ code: 'AI_NOT_CONFIGURED' }))
      .toBe('ai.chat.errors.notAvailable');
    expect(wikiAiErrorTranslationKey({ message: 'AI request failed' }))
      .toBe('ai.chat.errors.requestFailed');
  });
});
