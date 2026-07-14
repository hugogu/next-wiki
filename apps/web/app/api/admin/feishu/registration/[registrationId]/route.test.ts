import { beforeEach, describe, expect, it, vi } from 'vitest';

const createApiContext = vi.hoisted(() => vi.fn());
const checkFeishuAppRegistration = vi.hoisted(() => vi.fn());
const cancelFeishuAppRegistration = vi.hoisted(() => vi.fn());

vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/feishu-app-registration', () => ({
  checkFeishuAppRegistration,
  cancelFeishuAppRegistration,
}));

import { DELETE, GET } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'user-1', role: 'admin' as const } };
const routeContext = { params: Promise.resolve({ registrationId: 'registration-1' }) };

beforeEach(() => {
  createApiContext.mockReset();
  checkFeishuAppRegistration.mockReset();
  cancelFeishuAppRegistration.mockReset();
  createApiContext.mockResolvedValue(ctx);
  checkFeishuAppRegistration.mockResolvedValue({ status: 'pending' });
});

describe('Feishu QR registration polling API', () => {
  it('polls once without exposing credentials', async () => {
    const response = await GET(new Request('http://localhost'), routeContext);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'pending' });
    expect(checkFeishuAppRegistration).toHaveBeenCalledWith(ctx, 'registration-1');
  });

  it('cancels the server-held device-code session', async () => {
    const response = await DELETE(new Request('http://localhost'), routeContext);
    expect(response.status).toBe(204);
    expect(cancelFeishuAppRegistration).toHaveBeenCalledWith(ctx, 'registration-1');
  });
});
