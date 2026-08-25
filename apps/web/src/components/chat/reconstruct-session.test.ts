import type { AiActionEvent } from '@next-wiki/shared';
import {
  reconstructSessionFromEvents,
  recoverLatestSessionTurnFromServer,
  recoverSessionFromServer,
} from './reconstruct-session';

function event(overrides: Partial<AiActionEvent>): AiActionEvent {
  return {
    id: 1,
    actionId: 'action-1',
    type: 'text_delta',
    payload: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('reconstructSessionFromEvents', () => {
  it('reassembles question, answer, thinking, and citations from an ordered event log', () => {
    const citation = {
      pageId: '00000000-0000-4000-8000-000000000001',
      title: 'Guide',
      path: 'guide',
      locale: 'en',
      revisionId: '00000000-0000-4000-8000-000000000002',
      revisionHash: 'hash',
    };
    const events: AiActionEvent[] = [
      event({ id: 1, type: 'question', payload: { text: 'What is the answer?' } }),
      event({ id: 2, type: 'reasoning_delta', payload: { text: 'Thinking it through. ' } }),
      event({ id: 3, type: 'text_delta', payload: { text: 'The answer is [S1].' } }),
      event({ id: 4, type: 'citations', payload: { citations: [citation] } }),
      event({ id: 5, type: 'completed', payload: { status: 'completed' } }),
    ];

    const result = reconstructSessionFromEvents(events);
    expect(result).toEqual({
      question: 'What is the answer?',
      answer: 'The answer is [S1].',
      thinking: 'Thinking it through. ',
      citations: [citation],
      toolCalls: [],
      searchResults: [],
      insufficient: false,
      errorMessage: null,
    });
  });

  it('strips inline <think> tags embedded in text_delta chunks', () => {
    const events: AiActionEvent[] = [
      event({ id: 1, type: 'text_delta', payload: { text: '<think>reasoning here</think>final answer' } }),
    ];
    const result = reconstructSessionFromEvents(events);
    expect(result.answer).toBe('final answer');
    expect(result.thinking).toBe('reasoning here');
  });

  it('flags an insufficient-evidence answer and clears its text', () => {
    const events: AiActionEvent[] = [
      event({ id: 1, type: 'text_delta', payload: { text: 'INSUFFICIENT_WIKI_EVIDENCE\n\nSources:\n- unrelated' } }),
    ];
    const result = reconstructSessionFromEvents(events);
    expect(result.insufficient).toBe(true);
    expect(result.answer).toBe('');
  });

  it('captures the error message from an error event', () => {
    const events: AiActionEvent[] = [
      event({ id: 1, type: 'error', payload: { code: 'PROVIDER_ERROR', message: 'Provider timed out' } }),
    ];
    const result = reconstructSessionFromEvents(events);
    expect(result.errorMessage).toBe('Provider timed out');
  });

  it('keeps the final tool-call state and its search result links', () => {
    const toolCallId = '00000000-0000-0000-0000-000000000001';
    const basePayload = {
      toolCallId,
      sequence: 1,
      providerKey: 'next-wiki',
      toolName: 'search_wiki',
      commandMarkdown: '```tool-call\\ntool: search_wiki\\n```',
      requestedReview: 'none' as const,
      effectiveReview: 'none' as const,
    };
    const result = reconstructSessionFromEvents([
      event({ id: 1, type: 'tool_call', payload: { ...basePayload, status: 'running' } }),
      event({
        id: 2,
        type: 'tool_call',
        payload: {
          ...basePayload,
          status: 'succeeded',
          resultSummary: '1 readable page(s) matched.',
          wikiSearchResults: [{ title: 'Fund guide', path: 'finance/funds', spaceSlug: 'wiki' }],
        },
      }),
    ]);

    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        toolCallId,
        status: 'succeeded',
        wikiSearchResults: [{ title: 'Fund guide', path: 'finance/funds', spaceSlug: 'wiki' }],
      }),
    ]);
  });
});

describe('recoverSessionFromServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const rawConversation = {
    pageId: 'page-1',
    path: 'conversations/wiki-ai/x',
    url: '/raw/conversations/wiki-ai/x',
    channel: 'wiki-ai',
    captureStatus: 'captured',
    conversation: {
      status: 'completed',
      question: 'Q',
      answer: 'A from raw',
      thinking: 'T',
      citations: [],
      insufficient: false,
      errorMessage: null,
    },
  };

  it('falls back to the captured Raw conversation once the events are purged', async () => {
    const apiGet = vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:turn:action-1', rawConversation },
      turns: [{ action: { id: 'action-1', status: 'completed' }, events: [] }],
    });
    const result = await recoverSessionFromServer('action-1');
    expect(result).toMatchObject({
      status: 'completed',
      question: 'Q',
      answer: 'A from raw',
      thinking: 'T',
      toolCalls: [],
      searchResults: [],
    });
    expect(apiGet).toHaveBeenCalledWith('/api/ai/sessions/legacy:turn:action-1');
  });

  it('reconstructs from the turn events while they survive', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:turn:action-1', rawConversation },
      turns: [{
        action: { id: 'action-1', status: 'completed' },
        events: [
          event({ id: 1, type: 'question', payload: { text: 'Q' } }),
          event({ id: 2, type: 'text_delta', payload: { text: 'event-recovered' } }),
        ],
      }],
    });
    const result = await recoverSessionFromServer('action-1');
    expect(result).toMatchObject({
      status: 'completed',
      question: 'Q',
      answer: 'event-recovered',
    });
  });

  it('falls back to event reconstruction when no captured conversation exists', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:turn:action-1', rawConversation: null },
      turns: [{
        action: { id: 'action-1', status: 'completed' },
        events: [
          event({ id: 1, type: 'question', payload: { text: 'Q' } }),
          event({ id: 2, type: 'text_delta', payload: { text: 'event-recovered' } }),
        ],
      }],
    });
    const result = await recoverSessionFromServer('action-1');
    expect(result).toMatchObject({
      status: 'completed',
      question: 'Q',
      answer: 'event-recovered',
    });
  });

  it('returns null when the conversation has no turn for this action', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:turn:action-1', rawConversation: null },
      turns: [],
    });
    await expect(recoverSessionFromServer('action-1')).resolves.toBeNull();
  });

  it('returns null when the server rejects the lookup', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockRejectedValue(new Error('NOT_FOUND'));
    const result = await recoverSessionFromServer('action-1');
    expect(result).toBeNull();
  });
});

describe('recoverLatestSessionTurnFromServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds the newest matching question in the persisted browser session', async () => {
    const apiGet = vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:session-1' },
      turns: [
        {
          action: { id: 'action-2', status: 'running' },
          events: [event({ id: 2, type: 'question', payload: { text: 'Current question' } })],
        },
        {
          action: { id: 'action-1', status: 'completed' },
          events: [event({ id: 1, type: 'question', payload: { text: 'Earlier question' } })],
        },
      ],
    });

    await expect(recoverLatestSessionTurnFromServer('session-1', 'Current question')).resolves.toMatchObject({
      actionId: 'action-2',
      status: 'running',
      question: 'Current question',
    });
    expect(apiGet).toHaveBeenCalledWith('/api/ai/sessions/legacy:session-1');
  });

  it('recovers a queued action before its worker has emitted the question event', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:session-1' },
      turns: [{
        action: { id: 'queued-action', status: 'queued' },
        events: [event({ id: 1, type: 'status', payload: { status: 'queued' } })],
      }],
    });

    await expect(recoverLatestSessionTurnFromServer('session-1', 'Question sent during navigation')).resolves.toMatchObject({
      actionId: 'queued-action',
      status: 'queued',
      question: '',
    });
  });

  it('prefers a new queued turn over an older identical completed question', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:session-1' },
      turns: [
        {
          action: { id: 'queued-action', status: 'queued' },
          events: [event({ id: 3, type: 'status', payload: { status: 'queued' } })],
        },
        {
          action: { id: 'old-action', status: 'completed' },
          events: [event({ id: 2, type: 'question', payload: { text: 'Repeat question' } })],
        },
      ],
    });

    await expect(recoverLatestSessionTurnFromServer('session-1', 'Repeat question')).resolves.toMatchObject({
      actionId: 'queued-action',
      status: 'queued',
    });
  });

  it('does not substitute an unrelated completed turn', async () => {
    vi.spyOn(await import('@/lib/api/client'), 'apiGet').mockResolvedValue({
      conversation: { conversationKey: 'legacy:session-1' },
      turns: [{
        action: { id: 'old-action', status: 'completed' },
        events: [event({ id: 1, type: 'question', payload: { text: 'Old question' } })],
      }],
    });

    await expect(recoverLatestSessionTurnFromServer('session-1', 'New question')).resolves.toBeNull();
  });
});
