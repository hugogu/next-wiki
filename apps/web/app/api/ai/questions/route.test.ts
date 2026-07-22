import { NextRequest } from 'next/server';
import { vi } from 'vitest';

const services = vi.hoisted(() => ({
  createWikiQuestion: vi.fn(),
  createWikiToolChat: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'u1', role: 'editor' } })),
}));
vi.mock('@/server/services/ai-question', () => services);

import * as questionsRoute from './route';

function post(body: unknown) {
  return questionsRoute.POST(
    new NextRequest('http://localhost/api/ai/questions', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('POST /api/ai/questions — additive tools option', () => {
  beforeEach(() => {
    services.createWikiQuestion.mockReset();
    services.createWikiToolChat.mockReset();
    services.createWikiQuestion.mockResolvedValue({ id: 'q1', feature: 'wiki_question', status: 'queued', eventsUrl: '/e' });
  });

  it('keeps ordinary Q&A behavior when tools are omitted', async () => {
    const response = await post({ question: 'What is X?', mode: 'retrieval' });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ feature: 'wiki_question' });
    expect(services.createWikiToolChat).not.toHaveBeenCalled();
  });

  it('routes to tool chat when tools are enabled and the model supports them', async () => {
    services.createWikiToolChat.mockResolvedValue({
      fallback: false,
      action: { id: 'tc1', feature: 'wiki_tool_chat', status: 'queued', eventsUrl: '/e' },
    });
    const conversation = [{ question: 'What is X?', answer: 'X is prior content.' }];
    const response = await post({
      question: 'Write the above to a page',
      mode: 'retrieval',
      conversation,
      tools: { enabled: true, requestedReview: 'admin_review' },
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ feature: 'wiki_tool_chat' });
    expect(services.createWikiToolChat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        question: 'Write the above to a page',
        requestedReview: 'admin_review',
        conversation,
      }),
    );
    expect(services.createWikiQuestion).not.toHaveBeenCalled();
  });

  it('falls back to ordinary Q&A when the selected model cannot call tools', async () => {
    services.createWikiToolChat.mockResolvedValue({ fallback: true });
    const response = await post({ question: 'Retag docs', mode: 'retrieval', tools: { enabled: true } });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ feature: 'wiki_question' });
    expect(services.createWikiToolChat).toHaveBeenCalled();
    expect(services.createWikiQuestion).toHaveBeenCalled();
  });
});
