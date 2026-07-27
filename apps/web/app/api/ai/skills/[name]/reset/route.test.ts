import { POST } from './route';
import { createApiContext } from '@/server/api/session';
import { resetSkill } from '@/server/services/skills/admin';
import { DomainError } from '@/server/errors';

vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn() }));
vi.mock('@/server/services/skills/admin', () => ({ resetSkill: vi.fn() }));

const params = Promise.resolve({ name: 'wiki-linker' });
const request = () =>
  new Request('http://localhost/api/ai/skills/wiki-linker/reset', { method: 'POST' }) as never;

/** Reset to shipped default (028, FR-034). */
describe('/api/ai/skills/{name}/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createApiContext).mockResolvedValue({
      actor: { kind: 'user', userId: 'u1', role: 'admin' },
    } as never);
  });

  it('resets a built-in skill', async () => {
    vi.mocked(resetSkill).mockResolvedValue(undefined);
    const response = await POST(request(), { params });
    expect(response.status).toBe(204);
    expect(resetSkill).toHaveBeenCalledWith(expect.anything(), 'wiki-linker');
  });

  it('is a no-op on a built-in that was never edited', async () => {
    // The service returns early rather than erroring: there is nothing to
    // restore, and telling an admin "failed" would be wrong.
    vi.mocked(resetSkill).mockResolvedValue(undefined);
    expect((await POST(request(), { params })).status).toBe(204);
  });

  it('refuses to reset a skill that has no shipped default', async () => {
    vi.mocked(resetSkill).mockRejectedValue(
      new DomainError('SKILL_READ_ONLY', 'Only built-in skills can be reset to a default'),
    );
    const response = await POST(request(), { params });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SKILL_READ_ONLY' });
  });

  it('denies a non-admin', async () => {
    vi.mocked(resetSkill).mockRejectedValue(new DomainError('FORBIDDEN', 'Admin access is required'));
    expect((await POST(request(), { params })).status).toBe(403);
  });
});
