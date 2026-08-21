import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_PORT = process.env.WEB_PORT || '3001';
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';

/**
 * Directory containing the `ssh` wrapper used to redirect git's SSH transport to
 * a local bare repository during static-site publish E2E tests.
 */
const SSH_WRAPPER_DIR = path.join(__dirname, 'e2e', 'ssh-wrapper');

/**
 * Playwright configuration for the no-SPA navigation contract and role/publish
 * end-to-end flows. Tests assume the app is running on the base URL.
 */
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './test/e2e-global-teardown.mjs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      `E2E_DATABASE_URL="${E2E_DATABASE_URL}" node test/prepare-e2e-db.mjs && ` +
      `DATABASE_URL="${E2E_DATABASE_URL}" ` +
      `NEXT_WIKI_E2E=true ` +
      `OPENROUTER_BASE_URL=http://127.0.0.1:31987 ` +
      `CONTENT_LOCAL_BASE_PATH=/tmp/next-wiki-e2e-content ` +
      `CONTENT_LOCAL_HOST_PATH=/tmp/next-wiki-e2e-content ` +
      `API_KEY_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 ` +
      `PATH="${SSH_WRAPPER_DIR}:${process.env.PATH ?? ''}" ` +
      `node test/run-e2e-server.mjs ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    // Never attach destructive E2E flows to an already-running development or
    // production server; always boot the dedicated *_test database server.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
