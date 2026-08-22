// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deleteAnonymousChatSession,
  getAnonymousChatHistoryStatus,
  listAnonymousChatSessions,
  probeAnonymousChatHistory,
  saveAnonymousChatSession,
} from './anonymous-chat-history';

describe('anonymous chat history storage', () => {
  it('falls back to in-memory history when IndexedDB is unavailable', async () => {
    await expect(probeAnonymousChatHistory()).resolves.toBe('unavailable');
    await saveAnonymousChatSession({
      sessionId: 'anonymous-session',
      mode: 'retrieval',
      messages: [{ id: 'message', role: 'user', text: 'Question' }],
    });

    expect(getAnonymousChatHistoryStatus()).toBe('unavailable');
    await expect(listAnonymousChatSessions()).resolves.toMatchObject([
      { sessionId: 'anonymous-session', messages: [{ text: 'Question' }] },
    ]);

    await deleteAnonymousChatSession('anonymous-session');
  });
});
