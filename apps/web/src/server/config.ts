import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_WIKI_SEED: z.enum(['true', 'false']).default('false'),
  API_KEY_ENCRYPTION_KEY: z.string().min(64).max(64),
});

// Local convenience defaults for dev/test only. In production a missing value
// must fail loudly rather than silently use an unsafe default.
const DEV_DATABASE_URL = 'postgresql://wiki:wiki@localhost:15433/wiki';
const DEV_API_KEY_ENCRYPTION_KEY = '0'.repeat(64);

export const env = envSchema.parse({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : DEV_DATABASE_URL),
  API_KEY_ENCRYPTION_KEY:
    process.env.API_KEY_ENCRYPTION_KEY ??
    (process.env.NODE_ENV === 'production' ? undefined : DEV_API_KEY_ENCRYPTION_KEY),
});
