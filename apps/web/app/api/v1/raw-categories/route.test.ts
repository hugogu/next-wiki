import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const service = vi.hoisted(() => ({ listCategories: vi.fn(), createCategory: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/raw-categories', () => service);

import * as route from './route';

const context = { params: Promise.resolve({}) };
const post = (body: unknown) =>
  route.POST(
    new NextRequest('http://localhost/api/v1/raw-categories', {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    }),
    context,
  );

describe('v1 raw-categories API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'api_key', userId: 'u', role: 'admin', scopes: ['create'], keyId: 'k' } });
  });

  it('lists categories for an admin-backed key', async () => {
    service.listCategories.mockResolvedValue([{ id: 'c1', name: 'Reference', slug: 'reference' }]);
    const response = await route.GET(new NextRequest('http://localhost/api/v1/raw-categories'), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ id: 'c1', name: 'Reference', slug: 'reference' }] });
  });

  it('creates a category and returns 201', async () => {
    service.createCategory.mockResolvedValue({ id: 'c2', name: 'Incidents', slug: 'incidents' });
    const response = await post({ name: 'Incidents', slug: 'incidents', isDefault: false });
    expect(response.status).toBe(201);
    expect(service.createCategory).toHaveBeenCalledWith(expect.anything(), { name: 'Incidents', slug: 'incidents', isDefault: false });
  });

  it('rejects malformed create bodies', async () => {
    const response = await post({ name: 'Incidents' });
    expect(response.status).toBe(422);
    expect(service.createCategory).not.toHaveBeenCalled();
  });

  it('maps SPACE_UNAVAILABLE (Copilot mode) through the public error mapper', async () => {
    service.listCategories.mockRejectedValueOnce(new DomainError('SPACE_UNAVAILABLE', 'copilot'));
    const response = await route.GET(new NextRequest('http://localhost/api/v1/raw-categories'), context);
    expect(response.status).toBe(403);
  });
});
