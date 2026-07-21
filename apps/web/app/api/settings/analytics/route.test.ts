import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const service = vi.hoisted(() => ({ readAnalyticsSettings: vi.fn(), upsertAnalyticsProviders: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/analytics', () => service);

import * as route from './route';

const VIEW = {
  providers: [
    {
      provider: 'baidu_tongji',
      label: 'Baidu Tongji',
      description: "Baidu's web analytics service.",
      enabled: true,
      trackingId: 'abcdef0123456789abcdef0123456789',
      trackingIdFormat: '32-character hex string',
      updatedAt: '2026-07-21T10:00:00.000Z',
    },
    {
      provider: 'google_analytics',
      label: 'Google Analytics',
      description: "Google's web analytics service (GA4).",
      enabled: false,
      trackingId: null,
      trackingIdFormat: 'G-XXXXXXXX (e.g. G-A1B2C3D4E5)',
      updatedAt: null,
    },
  ],
  activeScriptContent: 'try {\nvar _hmt = _hmt || [];\n} catch (e) {\n  console.error(e);\n}',
};

const putRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/settings/analytics', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('GET /api/settings/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin-id', role: 'admin' } });
  });

  it('returns 200 with the full provider list for an admin session', async () => {
    service.readAnalyticsSettings.mockResolvedValue(VIEW);
    const response = await route.GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.providers).toHaveLength(2);
    expect(body.providers.map((p: { provider: string }) => p.provider)).toEqual(['baidu_tongji', 'google_analytics']);
    expect(typeof body.activeScriptContent).toBe('string');
  });

  it('returns 401 without a session', async () => {
    service.readAnalyticsSettings.mockRejectedValueOnce(new DomainError('UNAUTHORIZED', 'Sign in to manage analytics settings'));
    const response = await route.GET();
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-admin session', async () => {
    service.readAnalyticsSettings.mockRejectedValueOnce(new DomainError('FORBIDDEN', 'nope'));
    const response = await route.GET();
    expect(response.status).toBe(403);
  });

  it('returns 403 for an API key actor', async () => {
    session.createApiContext.mockResolvedValue({
      actor: { kind: 'api_key', userId: 'u1', role: 'admin', scopes: [], keyId: 'k1' },
    });
    service.readAnalyticsSettings.mockRejectedValueOnce(new DomainError('FORBIDDEN', 'nope'));
    const response = await route.GET();
    expect(response.status).toBe(403);
  });
});

describe('PUT /api/settings/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin-id', role: 'admin' } });
  });

  it('returns 200 on valid input', async () => {
    service.upsertAnalyticsProviders.mockResolvedValue(VIEW);
    const response = await route.PUT(
      putRequest({ providers: [{ provider: 'baidu_tongji', enabled: true, trackingId: 'abcdef0123456789abcdef0123456789' }] }),
    );
    expect(response.status).toBe(200);
    expect(service.upsertAnalyticsProviders).toHaveBeenCalledWith(
      expect.anything(),
      { providers: [{ provider: 'baidu_tongji', enabled: true, trackingId: 'abcdef0123456789abcdef0123456789' }] },
    );
  });

  it('returns 400 for a malformed body (Zod rejection)', async () => {
    const response = await route.PUT(putRequest({ providers: [{ provider: 'not-a-provider', enabled: true, trackingId: null }] }));
    expect(response.status).toBe(400);
    expect(service.upsertAnalyticsProviders).not.toHaveBeenCalled();
  });

  it('returns 400 when the service rejects an invalid Tracking ID for an enabled provider', async () => {
    service.upsertAnalyticsProviders.mockRejectedValueOnce(
      new DomainError('BAD_REQUEST', 'Tracking ID for baidu_tongji must match the expected format'),
    );
    const response = await route.PUT(
      putRequest({ providers: [{ provider: 'baidu_tongji', enabled: true, trackingId: 'bad-id' }] }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 401 without a session', async () => {
    service.upsertAnalyticsProviders.mockRejectedValueOnce(new DomainError('UNAUTHORIZED', 'Sign in to manage analytics settings'));
    const response = await route.PUT(
      putRequest({ providers: [{ provider: 'baidu_tongji', enabled: false, trackingId: null }] }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-admin session', async () => {
    service.upsertAnalyticsProviders.mockRejectedValueOnce(new DomainError('FORBIDDEN', 'nope'));
    const response = await route.PUT(
      putRequest({ providers: [{ provider: 'baidu_tongji', enabled: false, trackingId: null }] }),
    );
    expect(response.status).toBe(403);
  });

  it('returns 403 for an API key actor', async () => {
    session.createApiContext.mockResolvedValue({
      actor: { kind: 'api_key', userId: 'u1', role: 'admin', scopes: [], keyId: 'k1' },
    });
    service.upsertAnalyticsProviders.mockRejectedValueOnce(new DomainError('FORBIDDEN', 'nope'));
    const response = await route.PUT(
      putRequest({ providers: [{ provider: 'baidu_tongji', enabled: false, trackingId: null }] }),
    );
    expect(response.status).toBe(403);
  });
});
