import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const spaces = vi.hoisted(() => ({ listSpaceConfigurations: vi.fn() }));
const writingMode = vi.hoisted(() => ({ isLlmWikiMode: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/spaces', () => spaces);
vi.mock('@/server/services/writing-mode', () => writingMode);

import { GET } from './route';

describe('GET /api/settings/spaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
    spaces.listSpaceConfigurations.mockResolvedValue([
      { id: 'wiki', kind: 'wiki', routePrefix: 'w', defaultVisibility: 'public' },
      { id: 'generated', kind: 'generated', routePrefix: 'g', defaultVisibility: 'registered' },
    ]);
    writingMode.isLlmWikiMode.mockResolvedValue(true);
  });

  it('returns every configured space with its active status to an administrator', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      spaces: [
        { id: 'wiki', kind: 'wiki', routePrefix: 'w', defaultVisibility: 'public', isActive: true },
        { id: 'generated', kind: 'generated', routePrefix: 'g', defaultVisibility: 'registered', isActive: true },
      ],
    });
  });

  it('does not reveal configuration to a non-administrator', async () => {
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'editor', role: 'editor' } });
    expect((await GET()).status).toBe(403);
    expect(spaces.listSpaceConfigurations).not.toHaveBeenCalled();
  });
});
