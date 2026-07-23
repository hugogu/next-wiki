import type { AiActionEvent } from '@next-wiki/shared';
import { reconstructSessionFromEvents } from './reconstruct-session';

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
});
