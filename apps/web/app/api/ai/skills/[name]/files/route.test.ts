import { GET, PUT, DELETE } from './route';
import { createApiContext } from '@/server/api/session';
import {
  deleteSkillFileForAdmin,
  readSkillFileForAdmin,
  writeSkillFileForAdmin,
} from '@/server/services/skills/admin';
import { DomainError } from '@/server/errors';

vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn() }));
vi.mock('@/server/services/skills/admin', () => ({
  readSkillFileForAdmin: vi.fn(),
  writeSkillFileForAdmin: vi.fn(),
  deleteSkillFileForAdmin: vi.fn(),
}));

const params = Promise.resolve({ name: 'wiki-linker' });
const url = (path?: string) =>
  `http://localhost/api/ai/skills/wiki-linker/files${path ? `?path=${encodeURIComponent(path)}` : ''}`;

const FILE = {
  path: 'SKILL.md',
  kind: 'instruction' as const,
  contentType: 'text/markdown',
  byteSize: 10,
  viewable: true,
  revision: 3,
  content: '---\nname: wiki-linker\ndescription: x\n---\n',
  editable: true,
};

/**
 * Skill file routes (028, US4).
 *
 * The path is a query parameter, not a URL segment — `next.config.ts` rewrites
 * every `/:path*.md` URL to the raw-Markdown export route, and every skill file
 * has an extension. These cases pin that contract along with the guards a
 * reviewer depends on.
 */
describe('/api/ai/skills/{name}/files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createApiContext).mockResolvedValue({
      actor: { kind: 'user', userId: 'u1', role: 'admin' },
    } as never);
  });

  it('reads a file whose name has an extension', async () => {
    vi.mocked(readSkillFileForAdmin).mockResolvedValue(FILE);
    const response = await GET(new Request(url('SKILL.md')) as never, { params });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ path: 'SKILL.md' });
    expect(readSkillFileForAdmin).toHaveBeenCalledWith(expect.anything(), 'wiki-linker', 'SKILL.md');
  });

  it('reads a nested file', async () => {
    vi.mocked(readSkillFileForAdmin).mockResolvedValue(FILE);
    await GET(new Request(url('reference/link-rules.md')) as never, { params });
    expect(readSkillFileForAdmin).toHaveBeenCalledWith(
      expect.anything(),
      'wiki-linker',
      'reference/link-rules.md',
    );
  });

  it('requires a path', async () => {
    const response = await GET(new Request(url()) as never, { params });
    expect(response.status).toBe(400);
    expect(readSkillFileForAdmin).not.toHaveBeenCalled();
  });

  it('rejects a path that escapes the package before touching storage', async () => {
    vi.mocked(readSkillFileForAdmin).mockRejectedValue(
      new DomainError('SKILL_PATH_INVALID', 'Invalid skill file path'),
    );
    const response = await GET(new Request(url('../../etc/passwd')) as never, { params });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'SKILL_PATH_INVALID' });
  });

  it('reports a binary or oversized file rather than streaming it', async () => {
    vi.mocked(readSkillFileForAdmin).mockRejectedValue(
      new DomainError('SKILL_FILE_NOT_VIEWABLE', 'This file is binary or too large'),
    );
    const response = await GET(new Request(url('reference/logo.png')) as never, { params });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SKILL_FILE_NOT_VIEWABLE' });
  });

  it('denies a non-admin without disclosing the file', async () => {
    vi.mocked(readSkillFileForAdmin).mockRejectedValue(
      new DomainError('FORBIDDEN', 'Admin access is required to manage skills'),
    );
    const response = await GET(new Request(url('SKILL.md')) as never, { params });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { content?: string };
    expect(body.content).toBeUndefined();
  });

  it('writes a file, passing the revision through as the concurrency token', async () => {
    vi.mocked(writeSkillFileForAdmin).mockResolvedValue({ ...FILE, revision: 4 });
    const response = await PUT(
      new Request(url('SKILL.md'), {
        method: 'PUT',
        body: JSON.stringify({ content: 'x', revision: 3 }),
      }) as never,
      { params },
    );
    expect(response.status).toBe(200);
    expect(writeSkillFileForAdmin).toHaveBeenCalledWith(
      expect.anything(),
      'wiki-linker',
      'SKILL.md',
      { content: 'x', revision: 3 },
    );
  });

  it('surfaces a stale revision as a conflict and applies nothing', async () => {
    vi.mocked(writeSkillFileForAdmin).mockRejectedValue(
      new DomainError('SKILL_FILE_CONFLICT', 'This file was changed by someone else (current revision 4)'),
    );
    const response = await PUT(
      new Request(url('SKILL.md'), {
        method: 'PUT',
        body: JSON.stringify({ content: 'x', revision: 3 }),
      }) as never,
      { params },
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('SKILL_FILE_CONFLICT');
    // The message names the current revision so the editor can tell the user
    // what to reload rather than just that something went wrong.
    expect(body.message).toContain('4');
  });

  it('surfaces an instruction file that would leave the skill invalid', async () => {
    vi.mocked(writeSkillFileForAdmin).mockRejectedValue(
      new DomainError('SKILL_INVALID', 'SKILL.md must start with a YAML frontmatter block'),
    );
    const response = await PUT(
      new Request(url('SKILL.md'), {
        method: 'PUT',
        body: JSON.stringify({ content: 'no frontmatter', revision: 1 }),
      }) as never,
      { params },
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: 'SKILL_INVALID' });
  });

  it('refuses to write a directory-sourced skill', async () => {
    vi.mocked(writeSkillFileForAdmin).mockRejectedValue(
      new DomainError('SKILL_READ_ONLY', 'This skill is loaded from the read-only skills directory'),
    );
    const response = await PUT(
      new Request(url('SKILL.md'), {
        method: 'PUT',
        body: JSON.stringify({ content: 'x', revision: 1 }),
      }) as never,
      { params },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SKILL_READ_ONLY' });
  });

  it('deletes a file', async () => {
    vi.mocked(deleteSkillFileForAdmin).mockResolvedValue(undefined);
    const response = await DELETE(
      new Request(url('reference/notes.md'), { method: 'DELETE' }) as never,
      { params },
    );
    expect(response.status).toBe(204);
    expect(deleteSkillFileForAdmin).toHaveBeenCalledWith(
      expect.anything(),
      'wiki-linker',
      'reference/notes.md',
    );
  });

  it('refuses to delete the instruction file', async () => {
    vi.mocked(deleteSkillFileForAdmin).mockRejectedValue(
      new DomainError('SKILL_INVALID', 'SKILL.md cannot be deleted'),
    );
    const response = await DELETE(
      new Request(url('SKILL.md'), { method: 'DELETE' }) as never,
      { params },
    );
    expect(response.status).toBe(422);
  });
});
