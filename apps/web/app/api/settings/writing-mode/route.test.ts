import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const writingMode = vi.hoisted(() => ({ getSwitchState: vi.fn(), switchMode: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/writing-mode', () => writingMode);

import * as route from './route';

describe('GET /api/settings/writing-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin-id', role: 'admin' } });
    writingMode.getSwitchState.mockResolvedValue({ mode: 'copilot', pendingMode: null, switchJobId: null });
    writingMode.switchMode.mockResolvedValue({ status: 'updated', mode: 'llm-wiki' });
  });

  it('returns the persisted mode and switch state to an admin', async () => {
    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mode: 'copilot', pendingMode: null, switchJobId: null });
  });

  it('rejects non-admin callers', async () => {
    session.createApiContext.mockResolvedValue({ actor: { kind: 'anonymous' } });

    const response = await route.GET();

    expect(response.status).toBe(403);
    expect(writingMode.getSwitchState).not.toHaveBeenCalled();
  });

  it('switches forward synchronously for an admin', async () => {
    const response = await route.PUT(new NextRequest('http://localhost/api/settings/writing-mode', {
      method: 'PUT', body: JSON.stringify({ mode: 'llm-wiki' }), headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mode: 'llm-wiki' });
    expect(writingMode.switchMode).toHaveBeenCalledWith(
      expect.anything(), 'llm-wiki', { rawVisibility: undefined, generatedVisibility: undefined },
    );
  });

  it('returns 202 and the stable job id for a queued reverse switch', async () => {
    writingMode.switchMode.mockResolvedValue({ status: 'pending', jobId: '2ac9f2d5-7df7-4e05-bd62-f5014c0d0325' });
    const response = await route.PUT(new NextRequest('http://localhost/api/settings/writing-mode', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'copilot', rawVisibility: 'public', generatedVisibility: 'restricted' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId: '2ac9f2d5-7df7-4e05-bd62-f5014c0d0325' });
  });

  it('maps switch conflicts and rejects malformed bodies', async () => {
    writingMode.switchMode.mockRejectedValueOnce(new DomainError('MODE_SWITCH_IN_PROGRESS', 'switching'));
    const conflict = await route.PUT(new NextRequest('http://localhost/api/settings/writing-mode', {
      method: 'PUT', body: JSON.stringify({ mode: 'copilot', rawVisibility: 'public', generatedVisibility: 'public' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(conflict.status).toBe(409);

    const invalid = await route.PUT(new NextRequest('http://localhost/api/settings/writing-mode', {
      method: 'PUT', body: JSON.stringify({ mode: 'invalid' }), headers: { 'content-type': 'application/json' },
    }));
    expect(invalid.status).toBe(400);
    expect(writingMode.switchMode).toHaveBeenCalledTimes(1);
  });
});
