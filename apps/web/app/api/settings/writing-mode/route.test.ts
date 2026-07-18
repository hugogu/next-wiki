import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const writingMode = vi.hoisted(() => ({ getSwitchState: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/writing-mode', () => writingMode);

import * as route from './route';

describe('GET /api/settings/writing-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin-id', role: 'admin' } });
    writingMode.getSwitchState.mockResolvedValue({ mode: 'copilot', pendingMode: null, switchJobId: null });
  });

  it('returns the persisted mode and switch state to an admin', async () => {
    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mode: 'copilot', pendingMode: null, switchJobId: null });
  });

  it('rejects non-admin callers', async () => {
    session.createApiContext.mockResolvedValue({ actor: { kind: 'anonymous' } });

    const response = await route.GET();

    expect(response.status).toBe(403);
    expect(writingMode.getSwitchState).not.toHaveBeenCalled();
  });
});
