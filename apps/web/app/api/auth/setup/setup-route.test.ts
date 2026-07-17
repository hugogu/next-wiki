import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const services = vi.hoisted(() => ({ setupAdmin: vi.fn() }));

vi.mock('@/server/services/setup', () => services);

import * as setupRoute from './route';
import { DomainError } from '@/server/errors';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/auth/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the admin and returns nextStep ai', async () => {
    services.setupAdmin.mockResolvedValue({ userId: 'user-id' });
    const response = await setupRoute.POST(request({ email: 'owner@example.com', password: 'Password123!' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, nextStep: 'ai' });
    expect(services.setupAdmin).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'Password123!' });
  });

  it('rejects invalid input with 400', async () => {
    const response = await setupRoute.POST(request({ email: 'not-an-email', password: 'short' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('BAD_REQUEST');
    expect(services.setupAdmin).not.toHaveBeenCalled();
  });

  it('maps already-configured to 403', async () => {
    services.setupAdmin.mockRejectedValue(new DomainError('FORBIDDEN', 'An admin account already exists'));
    const response = await setupRoute.POST(request({ email: 'owner@example.com', password: 'Password123!' }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });

  it('maps duplicate email to 409', async () => {
    services.setupAdmin.mockRejectedValue(new DomainError('CONFLICT', 'An account with this email already exists'));
    const response = await setupRoute.POST(request({ email: 'owner@example.com', password: 'Password123!' }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CONFLICT');
  });
});
