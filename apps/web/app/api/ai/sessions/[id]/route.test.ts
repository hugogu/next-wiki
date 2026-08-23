import { vi } from 'vitest';

const actions = vi.hoisted(() => ({
  getConversationDetail: vi.fn(),
  deleteConversation: vi.fn(),
}));
const rawConversations = vi.hoisted(() => ({ getLatestConversationSnapshot: vi.fn() }));
const auth = vi.hoisted(() => ({ getAnonymousAiAccessToken: vi.fn(async () => undefined) }));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'u1', role: 'editor' } })),
}));
vi.mock('@/server/services/ai-actions', () => actions);
vi.mock('@/server/services/raw-conversations', () => rawConversations);
vi.mock('@/server/services/auth', () => auth);

import * as sessionRoute from './route';

const pointer = {
  pageId: 'page-1',
  path: 'conversations/wiki-ai/2026/07/26/abc',
  url: '/raw/conversations/wiki-ai/2026/07/26/abc',
  captureStatus: 'captured' as const,
  channel: 'wiki-ai' as const,
};

function get(id: string) {
  return sessionRoute.GET(new Request('http://localhost/api/ai/sessions/x') as never, {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/ai/sessions/{id} — durable snapshot', () => {
  beforeEach(() => {
    actions.getConversationDetail.mockReset();
    rawConversations.getLatestConversationSnapshot.mockReset();
    auth.getAnonymousAiAccessToken.mockResolvedValue(undefined);
  });

  it('attaches the captured snapshot so a conversation past event retention still renders', async () => {
    // Retention purged the events; the turns themselves still list.
    actions.getConversationDetail.mockResolvedValue({
      conversation: { conversationKey: 'legacy:s1', rawConversation: pointer },
      turns: [{ action: { id: 'a1' }, events: [] }],
    });
    rawConversations.getLatestConversationSnapshot.mockResolvedValue({
      status: 'completed',
      question: 'What is the deployment topology?',
      answer: 'A single Docker Compose stack.',
      thinking: '',
      citations: [],
      insufficient: false,
      errorMessage: null,
    });

    const body = await (await get('legacy:s1')).json();

    expect(rawConversations.getLatestConversationSnapshot).toHaveBeenCalledWith('page-1');
    expect(body.conversation.rawConversation).toMatchObject({
      pageId: 'page-1',
      conversation: { question: 'What is the deployment topology?' },
    });
  });

  it('leaves an uncaptured conversation untouched', async () => {
    actions.getConversationDetail.mockResolvedValue({
      conversation: { conversationKey: 'legacy:s2', rawConversation: null },
      turns: [{ action: { id: 'a1' }, events: [] }],
    });

    const body = await (await get('legacy:s2')).json();

    expect(rawConversations.getLatestConversationSnapshot).not.toHaveBeenCalled();
    expect(body.conversation.rawConversation).toBeNull();
  });

  it('keeps the pointer as-is when no snapshot could be read', async () => {
    actions.getConversationDetail.mockResolvedValue({
      conversation: { conversationKey: 'legacy:s3', rawConversation: pointer },
      turns: [],
    });
    rawConversations.getLatestConversationSnapshot.mockResolvedValue(null);

    const body = await (await get('legacy:s3')).json();

    expect(body.conversation.rawConversation).toEqual(pointer);
  });

  it('404s an unknown conversation key', async () => {
    actions.getConversationDetail.mockResolvedValue(null);
    expect((await get('legacy:missing')).status).toBe(404);
  });
});
