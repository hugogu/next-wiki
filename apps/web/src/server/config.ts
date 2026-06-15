import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_WIKI_SEED: z.enum(['true', 'false']).default('false'),
});

// Local convenience default for dev/test only. In production a missing
// DATABASE_URL must fail loudly rather than silently target localhost.
const DEV_DATABASE_URL = 'postgresql://wiki:wiki@localhost:15433/wiki';

export const env = envSchema.parse({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : DEV_DATABASE_URL),
});
