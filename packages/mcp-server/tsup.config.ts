import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // The public MCP package must not require the repository-private shared
  // package at runtime. Bundle the neutral tool catalogue into its artifact.
  noExternal: ['@next-wiki/shared'],
});
