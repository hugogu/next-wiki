import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const service = vi.hoisted(() => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  retireCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/raw-categories', () => service);

import * as collection from './route';
import * as item from './[id]/route';

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/settings/raw-categories', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });

describe('admin raw-categories API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
  });

  it('lists categories', async () => {
    service.listCategories.mockResolvedValue([{ id: 'c1', name: 'Support' }]);
    const response = await collection.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ id: 'c1', name: 'Support' }] });
  });

  it('creates a category and returns 201', async () => {
    service.createCategory.mockResolvedValue({ id: 'c2', name: 'Ops', slug: 'ops' });
    const response = await collection.POST(jsonRequest({ name: 'Ops', slug: 'ops', isDefault: true }));
    expect(response.status).toBe(201);
    expect(service.createCategory).toHaveBeenCalledWith(expect.anything(), { name: 'Ops', slug: 'ops', isDefault: true });
  });

  it('rejects malformed create bodies', async () => {
    const response = await collection.POST(jsonRequest({ slug: 'ops' }));
    expect(response.status).toBe(400);
    expect(service.createCategory).not.toHaveBeenCalled();
  });

  it('maps SPACE_UNAVAILABLE (Copilot mode) to 403', async () => {
    service.listCategories.mockRejectedValueOnce(new DomainError('SPACE_UNAVAILABLE', 'copilot'));
    const response = await collection.GET();
    expect(response.status).toBe(403);
  });

  it('updates a category', async () => {
    service.updateCategory.mockResolvedValue({ id: 'c1', name: 'Renamed' });
    const response = await item.PATCH(jsonRequest({ name: 'Renamed' }), { params: Promise.resolve({ id: 'c1' }) });
    expect(response.status).toBe(200);
    expect(service.updateCategory).toHaveBeenCalledWith(expect.anything(), 'c1', { name: 'Renamed' });
    expect(service.retireCategory).not.toHaveBeenCalled();
  });

  it('routes isRetired PATCH to the retire path', async () => {
    service.retireCategory.mockResolvedValue({ id: 'c1', isRetired: true });
    const response = await item.PATCH(jsonRequest({ isRetired: true }), { params: Promise.resolve({ id: 'c1' }) });
    expect(response.status).toBe(200);
    expect(service.retireCategory).toHaveBeenCalledWith(expect.anything(), 'c1');
    expect(service.updateCategory).not.toHaveBeenCalled();
  });

  it('deletes a category (204) and maps RAW_CATEGORY_HAS_ENTRIES to 409', async () => {
    service.deleteCategory.mockResolvedValueOnce(undefined);
    const ok = await item.DELETE(jsonRequest({}), { params: Promise.resolve({ id: 'c1' }) });
    expect(ok.status).toBe(204);

    service.deleteCategory.mockRejectedValueOnce(new DomainError('RAW_CATEGORY_HAS_ENTRIES', 'referenced'));
    const conflict = await item.DELETE(jsonRequest({}), { params: Promise.resolve({ id: 'c1' }) });
    expect(conflict.status).toBe(409);
  });
});
