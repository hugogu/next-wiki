import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const migrate = spawn('node', [join(__dirname, 'migrate/migrate.mjs')], {
  cwd: __dirname,
  stdio: 'inherit',
});

migrate.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const server = spawn('pnpm', ['--filter', '@next-wiki/web', 'start'], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  server.on('exit', (exitCode) => {
    process.exit(exitCode ?? 1);
  });
});
