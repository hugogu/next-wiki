import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const settings = vi.hoisted(() => ({
  readSearchSettings: vi.fn(),
  updateSearchSettings: vi.fn(),
}));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/search-settings', () => settings);

import * as route from './route';

const view = {
  fullTextSearchEnabled: true,
  fuzzySearchEnabled: true,
  semanticSearchEnabled: true,
  minRelevanceScore: 0,
  showExcerpts: true,
  excerptLength: 120,
  updatedAt: null,
};

describe('search settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
    settings.readSearchSettings.mockResolvedValue(view);
    settings.updateSearchSettings.mockResolvedValue(view);
  });

  it('returns settings through the existing admin GET resource', async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view);
    expect(settings.readSearchSettings).toHaveBeenCalledWith(expect.anything());
  });

  it('validates and forwards all capability switches through PATCH', async () => {
    const response = await route.PATCH(new NextRequest('http://localhost/api/settings/search', {
      method: 'PATCH',
      body: JSON.stringify({
        fullTextSearchEnabled: false,
        fuzzySearchEnabled: true,
        semanticSearchEnabled: false,
      }),
    }));

    expect(response.status).toBe(200);
    expect(settings.updateSearchSettings).toHaveBeenCalledWith(expect.anything(), {
      fullTextSearchEnabled: false,
      fuzzySearchEnabled: true,
      semanticSearchEnabled: false,
    });
  });

  it('rejects a request that would disable both lexical capabilities before the service', async () => {
    const response = await route.PATCH(new NextRequest('http://localhost/api/settings/search', {
      method: 'PATCH',
      body: JSON.stringify({ fullTextSearchEnabled: false, fuzzySearchEnabled: false }),
    }));

    expect(response.status).toBe(400);
    expect(settings.updateSearchSettings).not.toHaveBeenCalled();
  });

  it('keeps authorization failures on the existing route', async () => {
    settings.readSearchSettings.mockRejectedValue(new DomainError('FORBIDDEN', 'forbidden'));
    const response = await route.GET();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'FORBIDDEN', message: 'forbidden' });
  });
});
