import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createApiContext = vi.hoisted(() => vi.fn());
const getConfigView = vi.hoisted(() => vi.fn());
const updateConfig = vi.hoisted(() => vi.fn());

vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/feishu-config', () => ({ getConfigView, updateConfig }));

import { GET, PUT } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'user-1', role: 'admin' as const } };
const view = {
  enabled: false,
  appId: 'cli_example',
  hasAppSecret: true,
  hasEncryptKey: true,
  hasVerificationToken: false,
  connectionMode: 'webhook' as const,
  userRateLimitPerMinute: 10,
  chatRateLimitPerMinute: 30,
  notificationRetentionHours: 72,
  lastConnectedAt: null,
  lastError: null,
};

beforeEach(() => {
  createApiContext.mockReset();
  getConfigView.mockReset();
  updateConfig.mockReset();
  createApiContext.mockResolvedValue(ctx);
  getConfigView.mockResolvedValue(view);
  updateConfig.mockResolvedValue(view);
});

describe('Feishu admin configuration API', () => {
  it('returns only the masked configuration view', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view);
    expect(getConfigView).toHaveBeenCalledWith(ctx);
  });

  it('accepts write-only credentials without returning them', async () => {
    const request = new NextRequest('http://localhost/api/admin/feishu', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        appId: 'cli_example',
        appSecret: 'never-return-me',
        encryptKey: 'also-never-return-me',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(updateConfig).toHaveBeenCalledWith(ctx, expect.objectContaining({ enabled: true }));
    await expect(response.text()).resolves.not.toContain('never-return-me');
  });
});
