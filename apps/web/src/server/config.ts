import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  // In-process jobs use this origin to prewarm ISR without making a request
  // through the public reverse proxy or CDN. Docker's default reaches the
  // Next.js server through its loopback listener.
  APP_INTERNAL_URL: z.string().url().default('http://127.0.0.1:3000'),
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
  CONTENT_LOCAL_BASE_PATH: z.string().min(1).default('/data/content'),
  // Host-side bind mount shown to administrators for deployment diagnostics.
  // This is informational inside the container; Docker Compose owns the mount.
  CONTENT_LOCAL_HOST_PATH: z.string().optional(),
  AI_PROVIDER_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  AI_PROVIDER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_PROVIDER_TOOL_PLANNER_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  AI_EVENT_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  AI_ARTIFACT_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  AI_MAX_GENERATED_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  TRANSFER_ARTIFACT_BASE_PATH: z.string().min(1).default('/data/content/transfers'),
  TRANSFER_ARTIFACT_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  TRANSFER_MAX_COMPRESSED_BYTES: z.coerce.number().int().positive().default(2 * 1024 ** 3),
  TRANSFER_MAX_EXPANDED_BYTES: z.coerce.number().int().positive().default(4 * 1024 ** 3),
  TRANSFER_MAX_ENTRIES: z.coerce.number().int().positive().default(50_000),
  TRANSFER_MAX_MARKDOWN_BYTES: z.coerce.number().int().positive().default(10 * 1024 ** 2),
  TRANSFER_MAX_COMPRESSION_RATIO: z.coerce.number().positive().default(100),
  TRANSFER_REMOTE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  TRANSFER_REMOTE_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(5),
  TRANSFER_REMOTE_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  // Optional: default OpenRouter API key used when a provider's DB credentials
  // omit an apiKey. Lets personal deployments configure AI via .env without
  // pasting the key into the admin UI.
  OPENROUTER_API_KEY: z.string().optional(),
  // Optional OpenRouter API base URL override (proxy/mirror/test fixture).
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
});

// Local convenience defaults for dev/test only. In production a missing value
// must fail loudly rather than silently use an unsafe default.
const DEV_DATABASE_URL = 'postgresql://wiki:wiki@127.0.0.1:15433/wiki';
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
