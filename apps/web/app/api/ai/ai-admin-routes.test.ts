import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';

const services = vi.hoisted(() => ({
  readSettings: vi.fn(),
  updateSettings: vi.fn(),
  createProvider: vi.fn(),
  listProviders: vi.fn(),
  assignPurpose: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'admin', role: 'admin' } })),
}));
vi.mock('@/server/services/ai-admin', () => services);

import * as settingsRoute from './settings/route';
import * as providersRoute from './providers/route';
import * as assignmentRoute from './assignments/[purpose]/route';

describe('AI Admin REST routes', () => {
  it('validates and delegates settings updates', async () => {
    services.updateSettings.mockResolvedValue({ enabled: true });
    const response = await settingsRoute.PATCH(new NextRequest('http://localhost/api/ai/settings', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(response.status).toBe(200);
    expect(services.updateSettings).toHaveBeenCalledWith(expect.anything(), { enabled: true });
  });

  it('creates providers without exposing credentials in route output', async () => {
    services.createProvider.mockResolvedValue({ id: 'provider', name: 'Provider', hasCredentials: true });
    const response = await providersRoute.POST(new NextRequest('http://localhost/api/ai/providers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Provider',
        type: 'chat',
        vendor: 'custom',
        kind: 'openai_compatible',
        baseUrl: 'https://example.com/v1',
        config: {},
        credentials: { apiKey: 'secret' },
        enabled: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(response.status).toBe(201);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
  });

  it('accepts a Cloudflare detector config and never returns the token', async () => {
    services.createProvider.mockResolvedValue({
      id: 'provider',
      name: 'Cloudflare Detector',
      hasCredentials: true,
      config: { modelDetector: { source: 'cloudflare', cloudflareAccountId: 'acct-1' } },
    });
    const response = await providersRoute.POST(new NextRequest('http://localhost/api/ai/providers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cloudflare Detector',
        type: 'chat',
        vendor: 'custom',
        kind: 'openai_compatible',
        baseUrl: 'https://example.com/v1',
        config: { modelDetector: { source: 'cloudflare', cloudflareAccountId: 'acct-1' } },
        credentials: { apiKey: 'cf-secret-token' },
        enabled: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(response.status).toBe(201);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('cf-secret-token');
    expect(services.createProvider).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        config: { modelDetector: { source: 'cloudflare', cloudflareAccountId: 'acct-1' } },
      }),
    );
  });

  it('rejects invalid purposes and delegates valid assignments', async () => {
    const invalid = await assignmentRoute.PUT(
      new NextRequest('http://localhost/api/ai/assignments/invalid', {
        method: 'PUT', body: JSON.stringify({ modelId: randomUUID() }),
      }),
      { params: Promise.resolve({ purpose: 'invalid' }) },
    );
    expect(invalid.status).toBe(400);
    services.assignPurpose.mockResolvedValue({ purpose: 'wiki_text' });
    const modelId = randomUUID();
    const valid = await assignmentRoute.PUT(
      new NextRequest('http://localhost/api/ai/assignments/wiki_text', {
        method: 'PUT',
        body: JSON.stringify({ modelId, confirmCapability: true }),
      }),
      { params: Promise.resolve({ purpose: 'wiki_text' }) },
    );
    expect(valid.status).toBe(200);
    expect(services.assignPurpose).toHaveBeenCalledWith(
      expect.anything(),
      'wiki_text',
      modelId,
      { confirmCapability: true, embeddingDimensions: undefined },
    );
  });
});
