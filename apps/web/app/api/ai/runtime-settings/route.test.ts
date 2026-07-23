import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { DomainError } from '@/server/errors';

const services = vi.hoisted(() => ({
  getAiRuntimeSettings: vi.fn(),
  updateAiRuntimeSettings: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'admin', role: 'admin' } })),
}));
vi.mock('@/server/services/ai-runtime-settings', () => services);

import * as route from './route';

function patch(body: unknown) {
  return route.PATCH(
    new NextRequest('http://localhost/api/ai/runtime-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('AI runtime settings route', () => {
  beforeEach(() => {
    services.getAiRuntimeSettings.mockReset();
    services.updateAiRuntimeSettings.mockReset();
  });

  it('returns runtime settings for an Admin', async () => {
    services.getAiRuntimeSettings.mockResolvedValue({ params: {}, prompts: {}, defaults: {} });
    expect((await route.GET()).status).toBe(200);
  });

  it('returns 403 when a non-admin is denied', async () => {
    services.getAiRuntimeSettings.mockRejectedValue(new DomainError('FORBIDDEN', 'no'));
    expect((await route.GET()).status).toBe(403);
  });

  it('validates and delegates a params update', async () => {
    services.updateAiRuntimeSettings.mockResolvedValue({ params: {}, prompts: {}, defaults: {} });
    const response = await patch({ toolMaxCalls: 20, plannerTemperature: 0.4 });
    expect(response.status).toBe(200);
    expect(services.updateAiRuntimeSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toolMaxCalls: 20, plannerTemperature: 0.4 }),
    );
  });

  it('rejects an out-of-range param (400)', async () => {
    const response = await patch({ toolMaxCalls: 500 });
    expect(response.status).toBe(400);
    expect(services.updateAiRuntimeSettings).not.toHaveBeenCalled();
  });

  it('accepts a prompt override update', async () => {
    services.updateAiRuntimeSettings.mockResolvedValue({ params: {}, prompts: {}, defaults: {} });
    const response = await patch({ toolSystemPrompt: 'Custom.\n{{TOOLS}}' });
    expect(response.status).toBe(200);
    expect(services.updateAiRuntimeSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toolSystemPrompt: 'Custom.\n{{TOOLS}}' }),
    );
  });
});
