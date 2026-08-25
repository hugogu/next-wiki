import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Research connector/policy and citation compatibility tests are pure units,
 * so they deliberately do not start the database-backed integration setup. */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/server/web-research/**/*.test.ts',
      'src/server/web-research/result-format.test.ts',
      'src/server/jobs/wiki-question-tool-planner.test.ts',
      'src/components/chat/ChatCitations.test.tsx',
      'src/components/chat/AiChatPane.test.tsx',
      'src/components/chat/chat-url.test.ts',
      'src/components/chat/linkify-citations.test.ts',
      'src/server/services/feishu-notifications.citation-url.test.ts',
    ],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@next-wiki/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
