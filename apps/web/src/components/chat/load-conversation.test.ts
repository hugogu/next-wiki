// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiConversationDetail } from '@next-wiki/shared';

const fetchHistoryDetail = vi.hoisted(() => vi.fn());
const listAnonymousChatSessions = vi.hoisted(() => vi.fn());
const restoreSession = vi.hoisted(() => vi.fn());

vi.mock('./history-api', () => ({ fetchHistoryDetail }));
vi.mock('./anonymous-chat-history', () => ({ listAnonymousChatSessions }));
vi.mock('./chat-store', () => ({
  useChatStore: { getState: () => ({ restoreSession }) },
}));

import { restoreLinkedConversation } from './load-conversation';

const SERVER_KEY = '11111111-1111-4111-8111-111111111111';
const LOCAL_KEY = '22222222-2222-4222-8222-222222222222';

function serverDetail(): AiConversationDetail {
  return {
    conversation: {
      conversationKey: SERVER_KEY,
      latestActionId: 'action-1',
      latestQueuedAt: '2026-08-23T10:00:00.000Z',
      latestStatus: 'completed',
      questionExcerpt: 'Which release notes cover the importer?',
      rawConversation: null,
      turnCount: 1,
      completedTurnCount: 1,
      failedTurnCount: 0,
      cancelledTurnCount: 0,
      turnActionIds: ['action-1'],
    },
    turns: [
      {
        action: {
          id: 'action-1',
          questionMode: 'retrieval',
          requestMetadata: { webSessionId: 'web-session-1' },
        },
        events: [],
      },
    ],
  } as unknown as AiConversationDetail;
}

const localSession = {
  sessionId: LOCAL_KEY,
  mode: 'retrieval' as const,
  messages: [{ id: '1', role: 'user' as const, text: 'Hi' }],
  latestQueuedAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T10:00:01.000Z',
};

describe('restoreLinkedConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchHistoryDetail.mockResolvedValue(null);
    listAnonymousChatSessions.mockResolvedValue([]);
  });

  it('restores an account conversation and records the key it was linked by', async () => {
    fetchHistoryDetail.mockResolvedValue(serverDetail());

    await expect(restoreLinkedConversation(SERVER_KEY, false)).resolves.toBe(true);

    expect(listAnonymousChatSessions).not.toHaveBeenCalled();
    expect(restoreSession).toHaveBeenCalledWith(expect.objectContaining({ conversationKey: SERVER_KEY }));
  });

  it('restores from this browser when the actor is anonymous', async () => {
    listAnonymousChatSessions.mockResolvedValue([localSession]);

    await expect(restoreLinkedConversation(LOCAL_KEY, true)).resolves.toBe(true);

    expect(fetchHistoryDetail).not.toHaveBeenCalled();
    expect(restoreSession).toHaveBeenCalledWith(expect.objectContaining({ conversationKey: LOCAL_KEY }));
  });

  // A staticPublic document renders against an anonymous placeholder and only
  // hydrates its real visitor afterwards, so `anonymous` may be wrong here.
  it('still finds an account conversation while the actor still looks anonymous', async () => {
    fetchHistoryDetail.mockResolvedValue(serverDetail());

    await expect(restoreLinkedConversation(SERVER_KEY, true)).resolves.toBe(true);

    expect(listAnonymousChatSessions).toHaveBeenCalled();
    expect(restoreSession).toHaveBeenCalledWith(expect.objectContaining({ conversationKey: SERVER_KEY }));
  });

  it('reports a key no store holds, so the caller can drop the dead address', async () => {
    await expect(restoreLinkedConversation('unknown-key', false)).resolves.toBe(false);
    expect(restoreSession).not.toHaveBeenCalled();
  });

  it('stops before touching a second store once the pane has moved on', async () => {
    await expect(restoreLinkedConversation(SERVER_KEY, false, () => true)).resolves.toBe(false);

    expect(fetchHistoryDetail).not.toHaveBeenCalled();
    expect(listAnonymousChatSessions).not.toHaveBeenCalled();
  });
});
