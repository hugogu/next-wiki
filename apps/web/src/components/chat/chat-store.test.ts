import { vi } from 'vitest';

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { useChatStore } from './chat-store';

describe('useChatStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useChatStore.setState({ mode: 'retrieval', messages: [], open: false });
  });

  it('persists messages and open state across a simulated reload', () => {
    useChatStore.getState().setOpen(true);
    useChatStore.getState().add({ id: '1', role: 'user', text: 'Hi' });

    const stored = JSON.parse(sessionStorage.getItem('ai-chat') ?? '{}');
    expect(stored.state.open).toBe(true);
    expect(stored.state.messages).toEqual([{ id: '1', role: 'user', text: 'Hi' }]);
  });

  it('newSession clears messages but keeps the panel open and the selected mode', () => {
    useChatStore.getState().setOpen(true);
    useChatStore.getState().setMode('full');
    useChatStore.getState().add({ id: '1', role: 'user', text: 'Hi' });

    useChatStore.getState().newSession();

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().open).toBe(true);
    expect(useChatStore.getState().mode).toBe('full');
  });

  it('merges tool-call events and stores proposal links on the assistant message', () => {
    useChatStore.getState().add({ id: 'assistant', role: 'assistant', text: '' });

    useChatStore.getState().toolCall('assistant', {
      toolCallId: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
      providerKey: 'next-wiki',
      toolName: 'create_page',
      commandMarkdown: '```tool-call\ncreate_page\n```',
      status: 'running',
      requestedReview: 'admin_review',
      effectiveReview: 'admin_review',
    });
    useChatStore.getState().toolCall('assistant', {
      toolCallId: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
      providerKey: 'next-wiki',
      toolName: 'create_page',
      commandMarkdown: '```tool-call\ncreate_page\n```',
      status: 'succeeded',
      requestedReview: 'admin_review',
      effectiveReview: 'admin_review',
      resultSummary: 'Created draft page "Design".',
    });
    useChatStore.getState().toolProposal('assistant', {
      proposalId: '22222222-2222-4222-8222-222222222222',
      kind: 'metadata_update',
      status: 'pending',
      title: 'Update metadata',
      url: '/admin/ai/tools/proposals/22222222-2222-4222-8222-222222222222',
    });

    const message = useChatStore.getState().messages[0]!;
    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls?.[0]).toMatchObject({ status: 'succeeded', resultSummary: 'Created draft page "Design".' });
    expect(message.toolProposals?.[0]).toMatchObject({ title: 'Update metadata' });
  });
});
