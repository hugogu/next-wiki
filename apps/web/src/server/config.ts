import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_WIKI_SEED: z.enum(['true', 'false']).default('false'),
  API_KEY_ENCRYPTION_KEY: z.string().min(64).max(64),
  // Content storage (003). All optional with safe defaults so the zero-config
  // PostgreSQL-only deployment is unchanged (P1).
  // Maximum accepted size for an in-editor image upload, in bytes (default 10MB).
  CONTENT_ASSET_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  // How long an uploaded-but-never-referenced asset stays readable by its
  // uploader before it is treated as an abandoned upload, in hours.
  CONTENT_UPLOAD_TTL_HOURS: z.coerce.number().int().positive().default(24),
  // Optional base directory for the Local content backend (only used when the
  // active backend is `local`). Mounted as a Docker volume.
  CONTENT_LOCAL_BASE_PATH: z.string().optional(),
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
