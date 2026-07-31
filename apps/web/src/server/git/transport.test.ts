import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGitEnvironment } from './transport';

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'git-export-env-test-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('buildGitEnvironment', () => {
  it('hardens the SSH command against stalled connections', async () => {
    const dir = await tempDir();
    const env = await buildGitEnvironment(dir, 'ssh', undefined, 'PRIVATE_KEY');

    expect(env.GIT_SSH_COMMAND).toContain('-o ConnectTimeout=10');
    expect(env.GIT_SSH_COMMAND).toContain('-o ServerAliveInterval=15');
    expect(env.GIT_SSH_COMMAND).toContain('-o ServerAliveCountMax=3');
    expect(env.GIT_SSH_COMMAND).toContain('-o BatchMode=yes');
    // The private key is written with the restrictive perms ssh requires.
    await expect(readFile(join(dir, 'id_ed25519'), 'utf8')).resolves.toBe('PRIVATE_KEY');
  });

  it('caps stalled HTTPS transfers via low-speed limits', async () => {
    const dir = await tempDir();
    const env = await buildGitEnvironment(dir, 'https_token', 'x-access-token', 'TOKEN');

    expect(env.GIT_HTTP_LOW_SPEED_LIMIT).toBe('1000');
    expect(env.GIT_HTTP_LOW_SPEED_TIME).toBe('30');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_ASKPASS).toBeTruthy();
  });

  it('keeps the HTTPS credential out of the askpass script itself', async () => {
    const dir = await tempDir();
    const env = await buildGitEnvironment(dir, 'https_token', 'octocat', 'SUPER_SECRET');

    // The helper reads the token from the environment at call time. Baking it
    // into the script would leave the credential on disk in a world where the
    // temp directory outlives a crashed run.
    const script = await readFile(join(dir, 'git-askpass.sh'), 'utf8');
    expect(script).not.toContain('SUPER_SECRET');
    expect(env.GIT_TOKEN).toBe('SUPER_SECRET');
    expect(env.GIT_USERNAME).toBe('octocat');
  });

  it('defaults the HTTPS username when none is configured', async () => {
    const dir = await tempDir();
    const env = await buildGitEnvironment(dir, 'https_token', undefined, 'TOKEN');

    expect(env.GIT_USERNAME).toBe('x-access-token');
  });

  it('does not leak an SSH key into the environment', async () => {
    const dir = await tempDir();
    const env = await buildGitEnvironment(dir, 'ssh', undefined, 'PRIVATE_KEY');

    // The key reaches ssh through a mode-0600 file path, never through an
    // environment value that a child process or crash dump could surface.
    expect(env.GIT_SSH_COMMAND).not.toContain('PRIVATE_KEY');
    expect(Object.values(env)).not.toContain('PRIVATE_KEY');
  });
});
