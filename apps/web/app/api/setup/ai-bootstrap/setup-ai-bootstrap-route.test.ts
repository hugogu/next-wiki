import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const actor = vi.hoisted(() => ({ value: { kind: 'anonymous' } as unknown }));
const services = vi.hoisted(() => ({
  configureAiBootstrap: vi.fn(),
  skipAiBootstrap: vi.fn(),
}));

vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: actor.value })),
}));
vi.mock('@/server/services/setup-ai', () => services);

import * as route from './route';
import { DomainError } from '@/server/errors';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/setup/ai-bootstrap', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PUT /api/setup/ai-bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actor.value = { kind: 'user', userId: 'admin-id', role: 'admin' };
  });

  it('skip mode returns the skipped outcome', async () => {
    services.skipAiBootstrap.mockResolvedValue({
      status: 'skipped',
      purposes: {
        wiki_text: { status: 'skipped' },
        wiki_embedding: { status: 'skipped' },
        wiki_image: { status: 'skipped' },
      },
      nextStep: 'writing_mode',
    });
    const response = await route.PUT(request({ mode: 'skip' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('skipped');
    expect(body.nextStep).toBe('writing_mode');
    expect(services.skipAiBootstrap).toHaveBeenCalledWith(actor.value);
    expect(services.configureAiBootstrap).not.toHaveBeenCalled();
  });

  it('configure mode returns queued with action tracking', async () => {
    services.configureAiBootstrap.mockResolvedValue({
      status: 'queued',
      actionId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a003',
      pollUrl: '/api/setup',
    });
    const response = await route.PUT(request({ mode: 'configure', apiKey: 'sk-or-secret', autoAssign: true }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'queued', actionId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a003', pollUrl: '/api/setup' });
    expect(JSON.stringify(body)).not.toContain('sk-or-secret');
    expect(services.configureAiBootstrap).toHaveBeenCalledWith(actor.value, { apiKey: 'sk-or-secret', autoAssign: true });
  });

  it('returns completed per-purpose results', async () => {
    services.configureAiBootstrap.mockResolvedValue({
      status: 'completed',
      purposes: {
        wiki_text: { status: 'configured', modelId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a001', modelName: 'Example Chat' },
        wiki_embedding: { status: 'configured', modelId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a002', modelName: 'Example Embedding' },
        wiki_image: { status: 'needs_manual_setup', reason: 'No compatible detected model' },
      },
      nextStep: 'writing_mode',
    });
    const response = await route.PUT(request({ mode: 'configure', apiKey: 'sk-or-secret' }));
    const body = await response.json();
    expect(body.status).toBe('completed');
    expect(body.purposes.wiki_image.status).toBe('needs_manual_setup');
  });

  it('rejects invalid shapes with 400', async () => {
    const missingKey = await route.PUT(request({ mode: 'configure' }));
    expect(missingKey.status).toBe(400);
    const badMode = await route.PUT(request({ mode: 'explode' }));
    expect(badMode.status).toBe(400);
    expect(services.configureAiBootstrap).not.toHaveBeenCalled();
  });

  it('maps forbidden callers to 403', async () => {
    services.skipAiBootstrap.mockRejectedValue(new DomainError('FORBIDDEN', 'Setup requires the initial admin account'));
    const response = await route.PUT(request({ mode: 'skip' }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });

  it('maps AI_DISABLED to 409', async () => {
    services.configureAiBootstrap.mockRejectedValue(new DomainError('AI_DISABLED', 'AI is disabled by administrator policy'));
    const response = await route.PUT(request({ mode: 'configure', apiKey: 'sk-or-secret' }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('AI_DISABLED');
  });

  it('maps provider auth failure to 422 without echoing the key', async () => {
    services.configureAiBootstrap.mockRejectedValue(new DomainError('PROVIDER_AUTH_FAILED', 'OpenRouter credentials could not be validated'));
    const response = await route.PUT(request({ mode: 'configure', apiKey: 'sk-or-secret' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('PROVIDER_AUTH_FAILED');
    expect(JSON.stringify(body)).not.toContain('sk-or-secret');
  });

  it('maps provider rate limit to 429', async () => {
    services.configureAiBootstrap.mockRejectedValue(new DomainError('RATE_LIMITED', 'OpenRouter rate limit exceeded; retry shortly'));
    const response = await route.PUT(request({ mode: 'configure', apiKey: 'sk-or-secret' }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('RATE_LIMITED');
  });
});
