import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const service = vi.hoisted(() => ({ listDataSources: vi.fn(), updateDataSource: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/content-data-sources', () => service);

import * as collection from './route';
import * as item from './[sourceKey]/route';

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/settings/content-data-sources/wiki-ai-conversations', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });

describe('admin content-data-sources API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
  });

  it('lists registered sources', async () => {
    service.listDataSources.mockResolvedValue([{ sourceKey: 'wiki-ai-conversations', enabled: false }]);
    const response = await collection.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ sourceKey: 'wiki-ai-conversations', enabled: false }] });
  });

  it('maps FORBIDDEN (non-Admin) to 403', async () => {
    service.listDataSources.mockRejectedValueOnce(new DomainError('FORBIDDEN', 'nope'));
    const response = await collection.GET();
    expect(response.status).toBe(403);
  });

  it('updates a source', async () => {
    service.updateDataSource.mockResolvedValue({ sourceKey: 'wiki-ai-conversations', enabled: true });
    const response = await item.PATCH(jsonRequest({ enabled: true }), {
      params: Promise.resolve({ sourceKey: 'wiki-ai-conversations' }),
    });
    expect(response.status).toBe(200);
    expect(service.updateDataSource).toHaveBeenCalledWith(expect.anything(), 'wiki-ai-conversations', { enabled: true });
  });

  it('rejects a malformed body', async () => {
    const response = await item.PATCH(jsonRequest({ enabled: 'yes' }), {
      params: Promise.resolve({ sourceKey: 'wiki-ai-conversations' }),
    });
    expect(response.status).toBe(400);
    expect(service.updateDataSource).not.toHaveBeenCalled();
  });

  it('maps NOT_FOUND (unknown key) to 404', async () => {
    service.updateDataSource.mockRejectedValueOnce(new DomainError('NOT_FOUND', 'unknown source'));
    const response = await item.PATCH(jsonRequest({ enabled: true }), {
      params: Promise.resolve({ sourceKey: 'not-a-real-source' }),
    });
    expect(response.status).toBe(404);
  });

  it('maps DATA_SOURCE_UNAVAILABLE to 409', async () => {
    service.updateDataSource.mockRejectedValueOnce(new DomainError('DATA_SOURCE_UNAVAILABLE', 'copilot mode'));
    const response = await item.PATCH(jsonRequest({ enabled: true }), {
      params: Promise.resolve({ sourceKey: 'wiki-ai-conversations' }),
    });
    expect(response.status).toBe(409);
  });
});
