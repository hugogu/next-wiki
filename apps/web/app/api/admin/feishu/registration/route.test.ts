import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createApiContext = vi.hoisted(() => vi.fn());
const beginFeishuAppRegistration = vi.hoisted(() => vi.fn());

vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/feishu-app-registration', () => ({ beginFeishuAppRegistration }));

import { POST } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'user-1', role: 'admin' as const } };

beforeEach(() => {
  createApiContext.mockReset();
  beginFeishuAppRegistration.mockReset();
  createApiContext.mockResolvedValue(ctx);
  beginFeishuAppRegistration.mockResolvedValue({
    registrationId: 'registration-1',
    qrUrl: 'https://accounts.feishu.cn/verify?code=example',
    expiresAt: '2026-07-14T00:00:00.000Z',
    pollIntervalSeconds: 5,
  });
});

describe('Feishu QR registration start API', () => {
  it('returns a QR URL without returning a device code', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/admin/feishu/registration', {
        method: 'POST',
        body: JSON.stringify({ domain: 'feishu' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ registrationId: 'registration-1' }),
    );
    expect(beginFeishuAppRegistration).toHaveBeenCalledWith(ctx, { domain: 'feishu' });
  });

  it('rejects an unknown Feishu domain', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/admin/feishu/registration', {
        method: 'POST',
        body: JSON.stringify({ domain: 'unknown' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(400);
    expect(beginFeishuAppRegistration).not.toHaveBeenCalled();
  });
});
