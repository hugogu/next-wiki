import { NextRequest } from 'next/server';
import { vi } from 'vitest';

const services = vi.hoisted(() => ({
  createToolEnabledWikiQuestion: vi.fn(),
  createWikiQuestion: vi.fn(),
}));
const log = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'u1', role: 'editor' } })),
}));
vi.mock('@/server/services/ai-question', () => services);
vi.mock('@/server/logger', () => ({ logger: log }));

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
    services.createToolEnabledWikiQuestion.mockReset();
    log.error.mockReset();
    log.warn.mockReset();
    services.createWikiQuestion.mockResolvedValue({ id: 'q1', feature: 'wiki_question', status: 'queued', eventsUrl: '/e' });
  });

  it('keeps ordinary Q&A behavior when tools are omitted', async () => {
    const response = await post({ question: 'What is X?', mode: 'retrieval' });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ feature: 'wiki_question' });
    expect(services.createToolEnabledWikiQuestion).not.toHaveBeenCalled();
    expect(services.createWikiQuestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requestMetadata: { origin: 'web' } }),
    );
  });

  it('routes to tool-enabled question handling when tools are enabled and the model supports them', async () => {
    services.createToolEnabledWikiQuestion.mockResolvedValue({
      fallback: false,
      action: { id: 'tc1', feature: 'wiki_question', status: 'queued', eventsUrl: '/e' },
    });
    const conversation = [{ question: 'What is X?', answer: 'X is prior content.' }];
    const response = await post({
      question: 'Write the above to a page',
      mode: 'retrieval',
      sessionId: '00000000-0000-4000-8000-000000000026',
      conversation,
      tools: { enabled: true, requestedReview: 'admin_review' },
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ feature: 'wiki_question' });
    expect(services.createToolEnabledWikiQuestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        question: 'Write the above to a page',
        mode: 'retrieval',
        requestedReview: 'admin_review',
        conversation,
        requestMetadata: {
          origin: 'web',
          webSessionId: '00000000-0000-4000-8000-000000000026',
        },
      }),
    );
    expect(services.createWikiQuestion).not.toHaveBeenCalled();
  });

  it('falls back to ordinary Q&A when the selected model cannot call tools', async () => {
    services.createToolEnabledWikiQuestion.mockResolvedValue({ fallback: true });
    const response = await post({ question: 'Retag docs', mode: 'retrieval', tools: { enabled: true } });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ feature: 'wiki_question' });
    expect(services.createToolEnabledWikiQuestion).toHaveBeenCalled();
    expect(services.createWikiQuestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requestMetadata: { origin: 'web' } }),
    );
  });

  it('logs unexpected action-creation failures without exposing them in the response', async () => {
    services.createToolEnabledWikiQuestion.mockRejectedValue(new Error('database unavailable'));

    const response = await post({
      question: 'What is X?',
      mode: 'retrieval',
      tools: { enabled: true },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(log.error).toHaveBeenCalledWith('Wiki AI action creation failed', {
      error: 'database unavailable',
    });
  });
});
