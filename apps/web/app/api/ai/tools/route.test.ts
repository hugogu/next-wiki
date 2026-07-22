import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { DomainError } from '@/server/errors';

const services = vi.hoisted(() => ({
  listToolsWithEffectivePolicy: vi.fn(),
  updateToolPolicy: vi.fn(),
}));

let actor: { kind: string; userId: string; role: string } = { kind: 'user', userId: 'admin', role: 'admin' };
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor })),
}));
vi.mock('@/server/services/ai-tool-policy', () => services);

import * as toolsRoute from './route';
import * as policiesRoute from './policies/route';

describe('AI Tools admin routes', () => {
  beforeEach(() => {
    actor = { kind: 'user', userId: 'admin', role: 'admin' };
    services.listToolsWithEffectivePolicy.mockReset();
    services.updateToolPolicy.mockReset();
  });

  it('lists providers and tools for an Admin', async () => {
    services.listToolsWithEffectivePolicy.mockResolvedValue({ providers: [{ key: 'next-wiki' }], tools: [] });
    const response = await toolsRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ providers: [{ key: 'next-wiki' }] });
  });

  it('returns 403 when the tool listing service denies a non-admin', async () => {
    services.listToolsWithEffectivePolicy.mockRejectedValue(
      new DomainError('FORBIDDEN', 'Admin access is required to manage AI tools'),
    );
    const response = await toolsRoute.GET();
    expect(response.status).toBe(403);
  });

  it('validates and delegates a policy update', async () => {
    services.updateToolPolicy.mockResolvedValue({ id: 'p1', providerKey: 'next-wiki', category: 'tag' });
    const response = await policiesRoute.PATCH(
      new NextRequest('http://localhost/api/ai/tools/policies', {
        method: 'PATCH',
        body: JSON.stringify({ providerKey: 'next-wiki', category: 'tag', reviewPolicy: 'always_review' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(200);
    expect(services.updateToolPolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerKey: 'next-wiki', category: 'tag', reviewPolicy: 'always_review' }),
    );
  });

  it('rejects a policy update with no policy fields (400)', async () => {
    const response = await policiesRoute.PATCH(
      new NextRequest('http://localhost/api/ai/tools/policies', {
        method: 'PATCH',
        body: JSON.stringify({ providerKey: 'next-wiki', category: 'tag' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(400);
    expect(services.updateToolPolicy).not.toHaveBeenCalled();
  });

  it('returns 403 when the policy service denies a non-admin', async () => {
    services.updateToolPolicy.mockRejectedValue(
      new DomainError('FORBIDDEN', 'Admin access is required to manage AI tools'),
    );
    const response = await policiesRoute.PATCH(
      new NextRequest('http://localhost/api/ai/tools/policies', {
        method: 'PATCH',
        body: JSON.stringify({ providerKey: 'next-wiki', toolName: 'rename_tag', enabled: false }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(403);
  });
});
