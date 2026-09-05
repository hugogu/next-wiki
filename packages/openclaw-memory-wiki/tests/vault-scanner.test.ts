import { chmod, mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAX_FILE_BYTES, scanVault } from '../src/vault-scanner.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-wiki-'));
  await mkdir(join(root, 'entities'), { recursive: true });
  await mkdir(join(root, '_attachments'), { recursive: true });
  await mkdir(join(root, '.openclaw-wiki'), { recursive: true });
  await writeFile(join(root, 'AGENTS.md'), '---\nkind: person\n---\n# Alex\n');
  await writeFile(join(root, 'entities', 'Alex.md'), '[profile](../AGENTS.md)');
  await writeFile(join(root, '_attachments', 'ignored.md'), 'ignored');
  await writeFile(join(root, '.openclaw-wiki', 'state.md'), 'ignored');
  return root;
}

describe('scanVault', () => {
  it('preserves root and nested Markdown while excluding attachments/state', async () => {
    const docs = await scanVault(await fixture());
    expect(docs.map((doc) => doc.sourcePath)).toEqual(['AGENTS.md', 'entities/Alex.md']);
    expect(docs[0]?.content).toContain('kind: person');
    expect(docs[1]?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects symlinks instead of following them outside the vault', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memory-wiki-link-'));
    await writeFile(join(root, 'safe.md'), 'safe');
    await symlink(join(root, 'safe.md'), join(root, 'linked.md'));
    await expect(scanVault(root)).rejects.toThrow('Symlinks are not allowed');
  });

  it('skips oversized files with a warning instead of aborting the scan', async () => {
    const root = await fixture();
    await writeFile(join(root, 'entities', 'Huge.md'), `# Huge\n\n${'x'.repeat(520_000)}\n`);
    const warnings: Array<[string, string]> = [];
    const docs = await scanVault(root, 512_000, (sourcePath, reason) => warnings.push([sourcePath, reason]));
    expect(docs.map((doc) => doc.sourcePath)).toEqual(['AGENTS.md', 'entities/Alex.md']);
    expect(warnings).toEqual([['entities/Huge.md', 'too_large']]);
  });

  it('still throws when the vault path does not exist', async () => {
    await expect(scanVault('/nonexistent-vault-root-xyz')).rejects.toThrow();
  });

  it('skips files that become unreadable mid-scan instead of aborting', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      // chmod 0o000 does not restrict reads for the root user; skip the case
      // to avoid a false green run.
      return;
    }
    const root = await fixture();
    const lockedPath = join(root, 'entities', 'Locked.md');
    await writeFile(lockedPath, '# Locked\n');
    await chmod(lockedPath, 0o000);
    const warnings: Array<[string, string]> = [];
    try {
      const docs = await scanVault(root, 512_000, (sourcePath, reason) => warnings.push([sourcePath, reason]));
      expect(docs.map((d) => d.sourcePath)).toEqual(['AGENTS.md', 'entities/Alex.md']);
      expect(warnings).toContainEqual(['entities/Locked.md', 'unreadable']);
    } finally {
      await chmod(lockedPath, 0o644);
    }
  });

  it('skips unreadable subdirectories without aborting the scan', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return;
    }
    const root = await fixture();
    await mkdir(join(root, 'entities', 'Locked'), { recursive: true });
    await writeFile(join(root, 'entities', 'Locked', 'inner.md'), '# inner');
    await chmod(join(root, 'entities', 'Locked'), 0o000);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const docs = await scanVault(root);
      expect(docs.map((d) => d.sourcePath)).toEqual(['AGENTS.md', 'entities/Alex.md']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/skipping unreadable subdirectory entities\/Locked/));
    } finally {
      await chmod(join(root, 'entities', 'Locked'), 0o755);
      warnSpy.mockRestore();
    }
  });

  it('scans Markdown files regardless of filename case', async () => {
    const root = await fixture();
    await writeFile(join(root, 'entities', 'MixedCase.MD'), '# Mixed');
    const docs = await scanVault(root);
    expect(docs.map((d) => d.sourcePath)).toContain('entities/MixedCase.MD');
  });

  it('rejects nested symlinks and reports the full sourcePath', async () => {
    const root = await fixture();
    await mkdir(join(root, 'entities', 'nested'), { recursive: true });
    await writeFile(join(root, 'entities', 'nested', 'safe.md'), 'safe');
    await symlink(join(root, 'entities', 'nested', 'safe.md'), join(root, 'entities', 'nested', 'linked.md'));
    await expect(scanVault(root)).rejects.toThrow(/entities\/nested\/linked\.md/);
  });

  it('exports DEFAULT_MAX_FILE_BYTES at 512_000', () => {
    expect(DEFAULT_MAX_FILE_BYTES).toBe(512_000);
  });
});
