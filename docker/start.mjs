import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const appRoot = join(__dirname, 'apps/web');

const migrate = spawn('node', [join(appRoot, 'scripts/migrate.mjs')], {
  cwd: appRoot,
  stdio: 'inherit',
});

migrate.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const server = spawn('node', [join(appRoot, 'server.js')], {
    cwd: appRoot,
    stdio: 'inherit',
  });

  server.on('exit', (exitCode) => {
    process.exit(exitCode ?? 1);
  });
});
