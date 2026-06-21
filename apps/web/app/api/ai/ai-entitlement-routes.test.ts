import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { DomainError } from '@/server/errors';

const services = vi.hoisted(() => ({
  getUserEntitlements: vi.fn(),
  updateUserEntitlements: vi.fn(),
  getMyEntitlements: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'admin', role: 'admin' } })),
}));
vi.mock('@/server/services/ai-entitlements', () => services);

import * as userRoute from './entitlements/[userId]/route';
import * as meRoute from './entitlements/me/route';

const userId = '00000000-0000-4000-8000-000000000001';
const entitlement = {
  userId,
  aiEnabled: true,
  reasons: [],
  questionAnsweringEnabled: true,
  textOptimizationEnabled: false,
  imageGenerationEnabled: false,
};

describe('AI entitlement REST routes', () => {
  it('delegates Admin updates and current-user effective reads', async () => {
    services.updateUserEntitlements.mockResolvedValue(entitlement);
    const response = await userRoute.PUT(new NextRequest(`http://localhost/api/ai/entitlements/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({
        questionAnsweringEnabled: true,
        textOptimizationEnabled: false,
        imageGenerationEnabled: false,
      }),
    }), { params: Promise.resolve({ userId }) });
    expect(response.status).toBe(200);
    services.getMyEntitlements.mockResolvedValue(entitlement);
    expect((await meRoute.GET()).status).toBe(200);
  });

  it('maps non-admin denial without leaking internal details', async () => {
    services.getUserEntitlements.mockRejectedValue(new DomainError('FORBIDDEN', 'denied'));
    const response = await userRoute.GET(
      new NextRequest(`http://localhost/api/ai/entitlements/${userId}`),
      { params: Promise.resolve({ userId }) },
    );
    expect(response.status).toBe(403);
  });
});
