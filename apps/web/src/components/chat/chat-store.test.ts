// @vitest-environment jsdom
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
});
