import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const actor = vi.hoisted(() => ({ value: { kind: 'anonymous' } as unknown }));
const services = vi.hoisted(() => ({
  generateSamplePages: vi.fn(),
  skipSamplePages: vi.fn(),
}));

vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: actor.value })),
}));
vi.mock('@/server/services/setup-sample-pages', () => services);

import * as route from './route';
import { DomainError } from '@/server/errors';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/setup/sample-pages', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PUT /api/setup/sample-pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actor.value = { kind: 'user', userId: 'admin-id', role: 'admin' };
  });

  it('generate returns per-page outcomes and advances to summary', async () => {
    services.generateSamplePages.mockResolvedValue({
      status: 'completed',
      pages: [
        { path: 'welcome', status: 'updated', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a001' },
        { path: 'help/markdown-syntax', status: 'created', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a002' },
        { path: 'help/main-features', status: 'created', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a003' },
      ],
      nextStep: 'summary',
    });
    const response = await route.PUT(request({ mode: 'generate' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('completed');
    expect(body.pages).toHaveLength(3);
    expect(body.nextStep).toBe('summary');
    expect(services.generateSamplePages).toHaveBeenCalledWith(actor.value);
  });

  it('returns partial results with collisions', async () => {
    services.generateSamplePages.mockResolvedValue({
      status: 'partial',
      pages: [
        { path: 'welcome', status: 'updated', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a001' },
        { path: 'help/markdown-syntax', status: 'collision' },
        { path: 'help/main-features', status: 'created', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a003' },
      ],
      nextStep: 'summary',
    });
    const response = await route.PUT(request({ mode: 'generate' }));
    const body = await response.json();
    expect(body.status).toBe('partial');
    expect(body.pages[1].status).toBe('collision');
  });

  it('skip returns skipped without pages', async () => {
    services.skipSamplePages.mockResolvedValue({ status: 'skipped', pages: [], nextStep: 'summary' });
    const response = await route.PUT(request({ mode: 'skip' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'skipped', pages: [], nextStep: 'summary' });
    expect(services.generateSamplePages).not.toHaveBeenCalled();
  });

  it('rejects invalid modes with 400', async () => {
    const response = await route.PUT(request({ mode: 'explode' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('BAD_REQUEST');
  });

  it('maps forbidden callers to 403', async () => {
    services.generateSamplePages.mockRejectedValue(new DomainError('FORBIDDEN', 'Setup requires the initial admin account'));
    const response = await route.PUT(request({ mode: 'generate' }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });
});
