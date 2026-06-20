import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const port = process.argv[2] ?? '3001';
const nextEnvPath = new URL('../next-env.d.ts', import.meta.url);
const originalNextEnv = await readFile(nextEnvPath, 'utf8');
let restored = false;

async function restore() {
  if (restored) return;
  restored = true;
  await writeFile(nextEnvPath, originalNextEnv);
}

const child = spawn('pnpm', ['exec', 'next', 'dev', '--port', port], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    child.kill(signal);
    await restore();
    process.exit(0);
  });
}

child.on('exit', async (code) => {
  await restore();
  process.exit(code ?? 0);
});
