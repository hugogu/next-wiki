import { z } from 'zod';
import { AI_EVENT_RETENTION_HOURS_MAX } from '@next-wiki/shared';

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
  // Optional base directory for host-installed Agent Skills (028). Mounted
  // read-only; the service never writes here. Absent or unreadable is a notice,
  // not an error — built-in and admin-authored skills still load.
  SKILLS_BASE_PATH: z.string().min(1).default('/data/skills'),
  // Host-side bind mount shown to administrators for deployment diagnostics.
  // This is informational inside the container; Docker Compose owns the mount.
  SKILLS_HOST_PATH: z.string().optional(),
  AI_PROVIDER_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  AI_PROVIDER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // Image backends commonly render asynchronously before returning their first
  // byte. Keep the general request limit responsive while giving image work a
  // separately configurable, longer allowance.
  AI_IMAGE_GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  AI_EVENT_RETENTION_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(AI_EVENT_RETENTION_HOURS_MAX)
    .default(720),
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

// Some deployment platforms (PaaS docker-compose importers, blank-by-default
// secret stores) surface an unconfigured variable as an empty string rather
// than omitting it. Zod's `.default()` and the `??` fallbacks below only
// trigger on `undefined`, so treat "" the same as "not set" up front. This
// does not weaken the production guard below: API_KEY_ENCRYPTION_KEY set to
// "" in production is treated the same as fully unset, so it still fails
// loudly rather than silently picking up the dev/test default.
function withoutEmptyStrings(
  source: NodeJS.ProcessEnv
): Record<string, string | undefined> {
  // Null-prototype object: process.env is attacker-influenced in principle
  // (container/orchestrator config), and a key literally named `__proto__`
  // must not be able to touch Object.prototype via plain-object assignment.
  const result: Record<string, string | undefined> = Object.create(null);
  for (const [key, value] of Object.entries(source)) {
    result[key] = value === '' ? undefined : value;
  }
  return result;
}

function parseEnv() {
  const rawEnv = withoutEmptyStrings(process.env);
  const result = envSchema.safeParse({
    ...rawEnv,
    DATABASE_URL:
      rawEnv.DATABASE_URL ?? (rawEnv.NODE_ENV === 'production' ? undefined : DEV_DATABASE_URL),
    API_KEY_ENCRYPTION_KEY:
      rawEnv.API_KEY_ENCRYPTION_KEY ??
      (rawEnv.NODE_ENV === 'production' ? undefined : DEV_API_KEY_ENCRYPTION_KEY),
  });
  if (!result.success) {
    // Rethrow as a plain Error rather than let the raw ZodError escape: zod's
    // ZodError defines `message` as a getter with no setter, which crashes
    // with an opaque "Cannot set property message of [object Object] which
    // has only a getter" as soon as anything (including Next.js's own error
    // normalization) tries `err.message = ...` on it, hiding which
    // environment variable was actually missing or invalid.
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv();
