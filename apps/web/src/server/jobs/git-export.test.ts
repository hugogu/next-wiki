import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGitEnvironment } from './git-export';

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
});
