import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32).default('change-me-change-me-change-me-change-me'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_WIKI_SEED: z.enum(['true', 'false']).default('false'),
});

export const env = envSchema.parse({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://wiki:wiki@localhost:15433/wiki',
});
