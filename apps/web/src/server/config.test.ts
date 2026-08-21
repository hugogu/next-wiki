import { describe, it, expect, afterEach, vi } from 'vitest';
import { ZodError } from 'zod';

const REQUIRED_KEYS = ['DATABASE_URL', 'API_KEY_ENCRYPTION_KEY'] as const;

describe('config env parsing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws a readable error rather than a raw ZodError when required vars are missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of REQUIRED_KEYS) vi.stubEnv(key, undefined);

    // zod's ZodError defines `message` as a getter with no setter; letting it
    // escape uncaught crashes Next.js's error normalization with an opaque
    // "Cannot set property message of [object Object] which has only a
    // getter" instead of naming the missing variable. Assert we never expose
    // a ZodError instance across this boundary.
    let caught: unknown;
    try {
      await import('./config');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ZodError);
    expect((caught as Error).message).toContain('Invalid environment configuration');
    expect((caught as Error).message).toContain('DATABASE_URL');
  });

  it('parses successfully with required vars present', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://wiki:wiki@localhost:5432/wiki');
    vi.stubEnv('API_KEY_ENCRYPTION_KEY', '0'.repeat(64));

    const { env } = await import('./config');
    expect(env.DATABASE_URL).toBe('postgresql://wiki:wiki@localhost:5432/wiki');
  });

  it('falls back to the schema default when APP_URL is set but empty', async () => {
    // Some deployment platforms pre-create every declared env var as an empty
    // string rather than omitting it; that must not bypass the URL default.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://wiki:wiki@localhost:5432/wiki');
    vi.stubEnv('API_KEY_ENCRYPTION_KEY', '0'.repeat(64));
    vi.stubEnv('APP_URL', '');

    const { env } = await import('./config');
    expect(env.APP_URL).toBe('http://localhost:3000');
  });
});
