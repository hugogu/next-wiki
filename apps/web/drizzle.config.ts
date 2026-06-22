import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema/*.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  breakpoints: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/next_wiki',
  },
});
