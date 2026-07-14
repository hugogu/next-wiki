import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = process.env.WEB_PORT || '3001';
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';

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
      `DATABASE_URL="${E2E_DATABASE_URL}" NEXT_WIKI_SEED=true ` +
      `NEXT_WIKI_E2E=true ` +
      `CONTENT_LOCAL_BASE_PATH=/tmp/next-wiki-e2e-content ` +
      `CONTENT_LOCAL_HOST_PATH=/tmp/next-wiki-e2e-content ` +
      `API_KEY_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 ` +
      `node test/run-e2e-server.mjs ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    // Never attach destructive E2E flows to an already-running development or
    // production server; always boot the dedicated *_test database server.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
