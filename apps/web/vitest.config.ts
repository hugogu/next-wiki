import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { TEST_DATABASE_URL } from './test/test-db';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Force the destructive suites onto the dedicated test database. This
    // overrides any ambient DATABASE_URL so tests can never touch dev/docker data.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
    },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    sequence: {
      concurrent: false,
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@next-wiki/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
