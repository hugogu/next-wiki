import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const actor = vi.hoisted(() => ({ value: { kind: 'anonymous' } as unknown }));
const setupService = vi.hoisted(() => ({ recordWritingMode: vi.fn() }));

vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: actor.value })),
}));
vi.mock('@/server/services/setup', () => setupService);

import * as route from './route';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/setup/writing-mode', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PUT /api/setup/writing-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actor.value = { kind: 'user', userId: 'admin-id', role: 'admin' };
  });

  it('records the valid choice and returns the advanced setup state', async () => {
    setupService.recordWritingMode.mockResolvedValue({
      needed: true,
      currentStep: 'sample_pages',
      accountStatus: 'created',
      aiStatus: 'skipped',
      samplePagesStatus: 'not_started',
      summary: { adminCreated: true, ai: null, samplePages: null },
    });

    const response = await route.PUT(request({ mode: 'llm-wiki' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ currentStep: 'sample_pages' });
    expect(setupService.recordWritingMode).toHaveBeenCalledWith(actor.value, 'llm-wiki');
  });

  it('rejects an invalid mode before calling the setup service', async () => {
    const response = await route.PUT(request({ mode: 'invalid-mode' }));

    expect(response.status).toBe(400);
    expect(setupService.recordWritingMode).not.toHaveBeenCalled();
  });

  it('keeps anonymous callers behind the setup-admin gate', async () => {
    actor.value = { kind: 'anonymous' };
    setupService.recordWritingMode.mockRejectedValue(
      new DomainError('FORBIDDEN', 'Setup requires the initial admin account'),
    );

    const response = await route.PUT(request({ mode: 'copilot' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'FORBIDDEN',
      message: 'Setup requires the initial admin account',
    });
  });
});
