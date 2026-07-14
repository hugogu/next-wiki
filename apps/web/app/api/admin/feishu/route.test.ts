import { beforeEach, describe, expect, it, vi } from 'vitest';

const createApiContext = vi.hoisted(() => vi.fn());
const getConfigView = vi.hoisted(() => vi.fn());

vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/feishu-config', () => ({ getConfigView }));

import { GET } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'user-1', role: 'admin' as const } };
const view = {
  enabled: false,
  appId: 'cli_example',
  hasAppSecret: true,
  connectionMode: 'websocket' as const,
  lastConnectedAt: null,
  lastError: null,
};

beforeEach(() => {
  createApiContext.mockReset();
  getConfigView.mockReset();
  createApiContext.mockResolvedValue(ctx);
  getConfigView.mockResolvedValue(view);
});

describe('Feishu admin configuration API', () => {
  it('returns only the masked configuration view', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view);
    expect(getConfigView).toHaveBeenCalledWith(ctx);
  });
});
