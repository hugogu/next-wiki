import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@next-wiki/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
