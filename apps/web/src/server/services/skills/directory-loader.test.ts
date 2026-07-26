import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SKILL_LIMITS } from '@next-wiki/shared';
import { scanSkillsDirectory } from './directory-loader';

/**
 * The bounded loading contract (028, research R6).
 *
 * Constitution P10 allows filesystem discovery only against a bounded, testable
 * contract. These are that contract's assertions: every bound, every rejection
 * reason, and the two properties that matter most — one bad package never stops
 * the scan, and nothing outside a package is ever exposed.
 */

let root: string;

async function writeSkill(
  name: string,
  frontmatter: { name?: string; description?: string } | null,
  extra: Record<string, string> = {},
): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  if (frontmatter) {
    const lines = ['---'];
    if (frontmatter.name !== undefined) lines.push(`name: ${frontmatter.name}`);
    if (frontmatter.description !== undefined) lines.push(`description: ${frontmatter.description}`);
    lines.push('---', '', '# Body');
    await fs.writeFile(path.join(dir, 'SKILL.md'), lines.join('\n'));
  }
  for (const [relative, content] of Object.entries(extra)) {
    const target = path.join(dir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return dir;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('scanSkillsDirectory', () => {
  it('loads a valid package with its files', async () => {
    await writeSkill('release-notes', { name: 'release-notes', description: 'Draft notes.' }, {
      'reference/tone.md': '# Tone',
      'scripts/build.sh': 'echo hi',
    });
    const scan = await scanSkillsDirectory(root);
    expect(scan.rejected).toEqual([]);
    expect(scan.packages).toHaveLength(1);
    const pkg = scan.packages[0]!;
    expect(pkg.name).toBe('release-notes');
    expect(pkg.files.map((file) => file.path).sort()).toEqual([
      'SKILL.md',
      'reference/tone.md',
      'scripts/build.sh',
    ]);
    expect(pkg.files.find((file) => file.path === 'scripts/build.sh')?.kind).toBe('script');
  });

  it('keeps loading valid packages when one is malformed', async () => {
    await writeSkill('good', { name: 'good', description: 'Fine.' });
    await writeSkill('broken', null, { 'notes.md': 'no instruction file' });
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages.map((pkg) => pkg.name)).toEqual(['good']);
    expect(scan.rejected).toHaveLength(1);
    expect(scan.rejected[0]).toMatchObject({ reason: 'missing_instruction_file' });
    expect(scan.rejected[0]!.detail).toContain('SKILL.md');
  });

  it('reports invalid frontmatter with a specific reason', async () => {
    await writeSkill('nameless', { description: 'No name.' });
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages).toEqual([]);
    expect(scan.rejected[0]).toMatchObject({ reason: 'invalid_frontmatter' });
    expect(scan.rejected[0]!.detail).toContain('name');
  });

  it('loads a package under its declared name when the directory disagrees', async () => {
    // The frontmatter name is canonical (FR-013a): a directory rename must not
    // silently change which skill the model is being offered.
    await writeSkill('some-folder', { name: 'actual-name', description: 'Renamed.' });
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages[0]!.name).toBe('actual-name');
  });

  it('rejects a package with too many files', async () => {
    const extra: Record<string, string> = {};
    for (let index = 0; index <= SKILL_LIMITS.maxFilesPerPackage; index += 1) {
      extra[`reference/file-${index}.md`] = 'x';
    }
    await writeSkill('fat', { name: 'fat', description: 'Too many.' }, extra);
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages).toEqual([]);
    expect(scan.rejected[0]).toMatchObject({ reason: 'too_many_files' });
  });

  it('rejects a package over the total byte budget', async () => {
    // Individual files are not size-capped by the scan — only the package as a
    // whole is — so this uses a few large files rather than many small ones.
    const chunk = 'x'.repeat(Math.ceil(SKILL_LIMITS.maxPackageBytes / 2));
    await writeSkill('huge', { name: 'huge', description: 'Too big.' }, {
      'reference/a.md': chunk,
      'reference/b.md': chunk,
      'reference/c.md': chunk,
    });
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages).toEqual([]);
    expect(scan.rejected[0]).toMatchObject({ reason: 'too_large' });
  });

  it('reports packages beyond the scan limit instead of dropping them silently', async () => {
    for (let index = 0; index <= SKILL_LIMITS.maxPackagesPerScan; index += 1) {
      await writeSkill(`skill-${String(index).padStart(3, '0')}`, {
        name: `skill-${String(index).padStart(3, '0')}`,
        description: 'One of many.',
      });
    }
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages).toHaveLength(SKILL_LIMITS.maxPackagesPerScan);
    // A skill that vanished without explanation is worse than one that says why.
    expect(scan.rejected).toHaveLength(1);
    expect(scan.rejected[0]).toMatchObject({ reason: 'too_many_files' });
  });

  it('never exposes a file whose symlink resolves outside the package', async () => {
    const dir = await writeSkill('leaky', { name: 'leaky', description: 'Has a link.' });
    const secret = path.join(root, 'secret.txt');
    await fs.writeFile(secret, 'do not read me');
    await fs.symlink(secret, path.join(dir, 'reference-link.txt'));
    const scan = await scanSkillsDirectory(root);
    const pkg = scan.packages.find((item) => item.name === 'leaky');
    expect(pkg).toBeDefined();
    expect(pkg!.files.map((file) => file.path)).not.toContain('reference-link.txt');
  });

  it('rejects a package whose instruction file is a symlink pointing outside', async () => {
    const dir = path.join(root, 'escaped');
    await fs.mkdir(dir, { recursive: true });
    const outside = path.join(root, 'outside.md');
    await fs.writeFile(outside, '---\nname: escaped\ndescription: x\n---\n');
    await fs.symlink(outside, path.join(dir, 'SKILL.md'));
    const scan = await scanSkillsDirectory(root);
    expect(scan.packages).toEqual([]);
    expect(scan.rejected[0]).toMatchObject({ reason: 'path_escape' });
  });

  it('treats an unconfigured root as an informational notice, not a failure', async () => {
    const scan = await scanSkillsDirectory(null);
    expect(scan.packages).toEqual([]);
    expect(scan.rejected).toEqual([]);
    expect(scan.readable).toBe(false);
    expect(scan.notice).toContain('No skills directory is configured');
  });

  it('treats a missing root as an informational notice, not a failure', async () => {
    const scan = await scanSkillsDirectory(path.join(root, 'does-not-exist'));
    expect(scan.packages).toEqual([]);
    expect(scan.readable).toBe(false);
    expect(scan.notice).toContain('does not exist');
  });

  it('is deterministic for a given filesystem state', async () => {
    await writeSkill('b-skill', { name: 'b-skill', description: 'B.' });
    await writeSkill('a-skill', { name: 'a-skill', description: 'A.' });
    const first = await scanSkillsDirectory(root);
    const second = await scanSkillsDirectory(root);
    expect(first.packages.map((pkg) => pkg.name)).toEqual(['a-skill', 'b-skill']);
    expect(second.packages.map((pkg) => pkg.name)).toEqual(first.packages.map((pkg) => pkg.name));
  });

  it('does not descend past one level for package discovery', async () => {
    const nested = path.join(root, 'outer', 'inner');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(
      path.join(nested, 'SKILL.md'),
      '---\nname: inner\ndescription: Nested.\n---\n',
    );
    const scan = await scanSkillsDirectory(root);
    // `outer` has no SKILL.md of its own, so it is rejected; `inner` is never
    // considered a package in its own right.
    expect(scan.packages).toEqual([]);
    expect(scan.rejected.map((item) => item.reason)).toEqual(['missing_instruction_file']);
  });

  it('reports rejections without leaking anything outside the skills root', async () => {
    await writeSkill('nameless', { description: 'No name.' });
    const scan = await scanSkillsDirectory(root);
    for (const rejection of scan.rejected) {
      expect(rejection.detail).not.toContain('/etc');
      expect(rejection.detail).not.toMatch(/at Object|node_modules|\.ts:\d+/);
    }
  });
});
