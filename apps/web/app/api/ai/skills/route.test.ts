import { GET, POST } from './route';
import { createApiContext } from '@/server/api/session';
import { listSkillsForAdmin, createSkill } from '@/server/services/skills/admin';
import { DomainError } from '@/server/errors';

vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn() }));
vi.mock('@/server/services/skills/admin', () => ({
  listSkillsForAdmin: vi.fn(),
  createSkill: vi.fn(),
}));

/**
 * Route-level guarantees (028, FR-017).
 *
 * The permission decision belongs to the service, not the route — these assert
 * the route surfaces it correctly and never invents its own answer.
 */
describe('/api/ai/skills', () => {
  beforeEach(() => {
    vi.mocked(createApiContext).mockResolvedValue({
      actor: { kind: 'user', userId: 'u1', role: 'admin' },
    } as never);
  });

  it('returns the catalogue for an administrator', async () => {
    vi.mocked(listSkillsForAdmin).mockResolvedValue({
      skills: [],
      rejected: [],
      directory: {
        configured: false,
        basePath: null,
        hostPath: null,
        readable: false,
        notice: 'none',
        lastScannedAt: null,
      },
    });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ skills: [] });
  });

  it('maps a forbidden service decision to 403 without disclosing the catalogue', async () => {
    vi.mocked(listSkillsForAdmin).mockRejectedValue(
      new DomainError('FORBIDDEN', 'Admin access is required to manage skills'),
    );
    const response = await GET();
    expect(response.status).toBe(403);
    const body = (await response.json()) as { skills?: unknown };
    expect(body.skills).toBeUndefined();
  });

  it('rejects a malformed create body before touching the service', async () => {
    const request = new Request('http://localhost/api/ai/skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'Not Valid', description: '' }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('surfaces a name collision as 409', async () => {
    vi.mocked(createSkill).mockRejectedValue(
      new DomainError(
        'SKILL_NAME_TAKEN',
        'The name "wiki-linker" is already used by a builtin skill',
      ),
    );
    const request = new Request('http://localhost/api/ai/skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'wiki-linker', description: 'Mine.' }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SKILL_NAME_TAKEN' });
  });
});
