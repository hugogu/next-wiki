import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const port = process.argv[2] ?? '3001';
// Playwright launches the webServer command in a detached shell that becomes
// its own process-group leader, so `$PPID` (expanded by that shell, see
// playwright.config.ts) is the Playwright runner process. If the runner dies
// without shutting the group down — e.g. the hosting agent/terminal session is
// killed — this harness must clean up after itself: otherwise `next-server`
// keeps running as an orphan, spinning on a broken stdio socket until it eats
// all available memory.
const supervisorPid = Number.parseInt(process.argv[3] ?? '', 10);
const nextEnvPath = new URL('../next-env.d.ts', import.meta.url);
const originalNextEnv = await readFile(nextEnvPath, 'utf8');
let restored = false;
let shuttingDown = false;

async function restore() {
  if (restored) return;
  restored = true;
  await writeFile(nextEnvPath, originalNextEnv);
}

const child = spawn('pnpm', ['exec', 'next', 'dev', '--port', port], {
  stdio: 'inherit',
  env: process.env,
});

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill('SIGTERM');
  await restore();
  // `next dev` runs as a grandchild of this process, so killing only the
  // direct `pnpm` child can leave `next-server` behind. Under Playwright the
  // whole tree lives in the detached shell's process group: signal that group
  // as a backstop. Guarded on ppid > 1 so a manual run (whose parent is the
  // user's shell) never has an unrelated process group killed.
  if (supervisorPid > 0 && process.platform !== 'win32' && process.ppid > 1) {
    try {
      process.kill(-process.ppid, 'SIGKILL');
    } catch {
      // The process group is already gone.
    }
  }
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => void shutdown(0));
}

child.on('exit', (code) => void shutdown(code ?? 0));

if (Number.isInteger(supervisorPid) && supervisorPid > 1) {
  const watchdog = setInterval(() => {
    if (!isAlive(supervisorPid)) void shutdown(0);
  }, 2_000);
  watchdog.unref();
}
