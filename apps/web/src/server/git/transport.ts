import { execFile } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Shared Git transport for features that deliver a materialized tree to a
 * remote: Git export (003) and static site publishing (031). Those features are
 * deliberately independent in behavior — separate targets, triggers, state, and
 * artifacts — but "how to invoke git safely with a credential" is one problem
 * with one solved answer, and duplicating it would reintroduce fixed bugs.
 */

// Hard ceiling for any single git invocation. Network operations (fetch/push)
// can otherwise hang forever when a connection stalls — which wedges the
// single-worker job and stops sync entirely. On timeout Node SIGKILLs the
// process and the promise rejects, so the run fails into a degraded state and
// the queue keeps draining instead of piling up.
export const GIT_TIMEOUT_MS = 120_000;

export async function git(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, {
    cwd,
    env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

/**
 * Build the environment for credentialed git invocations.
 *
 * The credential never reaches argv or the remote URL: SSH reads a key file
 * written with restrictive permissions, and HTTPS goes through a GIT_ASKPASS
 * helper that reads it from the environment. Both refuse interactive prompts,
 * so a missing or wrong credential fails fast instead of hanging a worker.
 */
export async function buildGitEnvironment(
  directory: string,
  authMode: 'https_token' | 'ssh',
  username: string | undefined,
  secret: string,
): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Next Wiki',
    GIT_AUTHOR_EMAIL: 'next-wiki@localhost',
    GIT_COMMITTER_NAME: 'Next Wiki',
    GIT_COMMITTER_EMAIL: 'next-wiki@localhost',
  };
  if (authMode === 'ssh') {
    const keyPath = join(directory, 'id_ed25519');
    const knownHostsPath = join(directory, 'known_hosts');
    await writeFile(keyPath, secret, 'utf8');
    await chmod(keyPath, 0o600);
    // ConnectTimeout caps the initial TCP/handshake wait; the keepalive probes
    // tear the session down if the peer goes silent mid-transfer (a stalled
    // VPN/proxy) so ssh exits and releases git's stdio instead of lingering.
    // BatchMode refuses any interactive prompt rather than blocking on one.
    env.GIT_SSH_COMMAND = [
      'ssh',
      `-i ${keyPath}`,
      '-o IdentitiesOnly=yes',
      '-o StrictHostKeyChecking=accept-new',
      `-o UserKnownHostsFile=${knownHostsPath}`,
      '-o BatchMode=yes',
      '-o ConnectTimeout=10',
      '-o ServerAliveInterval=15',
      '-o ServerAliveCountMax=3',
    ].join(' ');
  } else {
    const askPassPath = join(directory, 'git-askpass.sh');
    await writeFile(
      askPassPath,
      '#!/bin/sh\ncase "$1" in *Username*) printf "%s" "$GIT_USERNAME";; *) printf "%s" "$GIT_TOKEN";; esac\n',
      'utf8',
    );
    await chmod(askPassPath, 0o700);
    env.GIT_ASKPASS = askPassPath;
    env.GIT_USERNAME = username || 'x-access-token';
    env.GIT_TOKEN = secret;
    // Abort an HTTPS transfer that drops below 1 KB/s for 30s rather than
    // hanging on a stalled connection (the SSH path relies on ServerAlive*).
    env.GIT_HTTP_LOW_SPEED_LIMIT = '1000';
    env.GIT_HTTP_LOW_SPEED_TIME = '30';
  }
  return env;
}
