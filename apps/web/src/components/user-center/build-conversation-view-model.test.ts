import { describe, expect, it, vi } from 'vitest';
import type { AiConversationDetail } from '@next-wiki/shared';
import { buildConversationViewModel } from './build-conversation-view-model';

vi.mock('@/components/chat/reconstruct-session', () => ({
  reconstructSessionFromEvents: vi.fn(
    (events: Array<{ type: string; payload: { text?: string } }>) => {
      const question = events.find((event) => event.type === 'question')?.payload?.text ?? '';
      return {
        question,
        answer: 'Answer',
        thinking: '',
        citations: [],
        toolCalls: [],
        searchResults: [],
        insufficient: false,
        errorMessage: null,
      };
    },
  ),
}));

function makeDetail(questions: string[]): AiConversationDetail {
  const now = new Date();
  return {
    conversation: {
      conversationKey: questions.join('-'),
      latestActionId: '00000000-0000-4000-8000-000000000000',
      latestStatus: 'completed',
      latestQueuedAt: now.toISOString(),
      questionExcerpt: questions[0] ?? null,
      rawConversation: null,
      turnCount: questions.length,
      completedTurnCount: questions.length,
      failedTurnCount: 0,
      cancelledTurnCount: 0,
      turnActionIds: questions.map((_, i) => `00000000-0000-4000-8000-00000000000${i}`),
    },
    turns: [...questions].reverse().map((question, index) => ({
      action: {
        id: `00000000-0000-4000-8000-00000000000${index}`,
        feature: 'wiki_question',
        status: 'completed',
        actorUserId: '00000000-0000-4000-8000-000000000001',
        providerId: null,
        providerName: null,
        modelId: null,
        modelName: null,
        indexGenerationId: null,
        pageId: null,
        pagePath: null,
        pageRevisionId: null,
        questionMode: 'retrieval',
        question: question,
        answer: 'Answer',
        thinking: '',
        errorMessage: null,
        queuedAt: new Date(2024, 0, 1 + index).toISOString(),
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(2024, 0, 1 + index).toISOString(),
      },
      events: [{ type: 'question', payload: { text: question } } as never],
    })),
  } as unknown as AiConversationDetail;
}

describe('buildConversationViewModel', () => {
  it('reverses server turns from newest-first to oldest-first', () => {
    const detail = makeDetail(['Oldest question', 'Middle question', 'Newest question']);
    const model = buildConversationViewModel(detail);
    expect(model.turns).toHaveLength(3);
    expect(model.turns?.[0]?.question).toBe('Oldest question');
    expect(model.turns?.[1]?.question).toBe('Middle question');
    expect(model.turns?.[2]?.question).toBe('Newest question');
  });

  it('uses the latest turn as the top-level fallback fields', () => {
    const detail = makeDetail(['First', 'Second']);
    const model = buildConversationViewModel(detail);
    expect(model.question).toBe('Second');
  });

  it('throws when the conversation has no turns', () => {
    const detail = makeDetail([]);
    expect(() => buildConversationViewModel(detail)).toThrow('Conversation detail returned zero turns');
  });
});
