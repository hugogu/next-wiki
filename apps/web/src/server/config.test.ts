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

  it('still fails loudly in production when API_KEY_ENCRYPTION_KEY is set but empty', async () => {
    // The empty-string normalization must not reopen the "unsafe default in
    // production" hole: a blank key is exactly as missing as no key at all.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://wiki:wiki@localhost:5432/wiki');
    vi.stubEnv('APP_URL', 'https://wiki.example.com');
    vi.stubEnv('API_KEY_ENCRYPTION_KEY', '');

    let caught: unknown;
    try {
      await import('./config');
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain('API_KEY_ENCRYPTION_KEY');
  });

  it('falls back to the dev/test key outside production when API_KEY_ENCRYPTION_KEY is set but empty', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'https://wiki.example.com');
    vi.stubEnv('API_KEY_ENCRYPTION_KEY', '');

    const { env } = await import('./config');
    expect(env.API_KEY_ENCRYPTION_KEY).toBe('0'.repeat(64));
  });

  describe('NEXT_WIKI_ADMIN_EMAIL / NEXT_WIKI_ADMIN_PASSWORD', () => {
    function stubRequired() {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATABASE_URL', 'postgresql://wiki:wiki@localhost:5432/wiki');
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', '0'.repeat(64));
    }

    it('accepts neither being set (falls back to the hard-coded demo admin)', async () => {
      stubRequired();
      const { env } = await import('./config');
      expect(env.NEXT_WIKI_ADMIN_EMAIL).toBeUndefined();
      expect(env.NEXT_WIKI_ADMIN_PASSWORD).toBeUndefined();
    });

    it('accepts both being set together', async () => {
      stubRequired();
      vi.stubEnv('NEXT_WIKI_ADMIN_EMAIL', 'me@example.com');
      vi.stubEnv('NEXT_WIKI_ADMIN_PASSWORD', 'a-strong-password');

      const { env } = await import('./config');
      expect(env.NEXT_WIKI_ADMIN_EMAIL).toBe('me@example.com');
      expect(env.NEXT_WIKI_ADMIN_PASSWORD).toBe('a-strong-password');
    });

    it('rejects setting only the email', async () => {
      stubRequired();
      vi.stubEnv('NEXT_WIKI_ADMIN_EMAIL', 'me@example.com');

      let caught: unknown;
      try {
        await import('./config');
      } catch (error) {
        caught = error;
      }
      expect((caught as Error).message).toContain('NEXT_WIKI_ADMIN_EMAIL and NEXT_WIKI_ADMIN_PASSWORD');
    });

    it('rejects setting only the password', async () => {
      stubRequired();
      vi.stubEnv('NEXT_WIKI_ADMIN_PASSWORD', 'a-strong-password');

      let caught: unknown;
      try {
        await import('./config');
      } catch (error) {
        caught = error;
      }
      expect((caught as Error).message).toContain('NEXT_WIKI_ADMIN_EMAIL and NEXT_WIKI_ADMIN_PASSWORD');
    });
  });
});
