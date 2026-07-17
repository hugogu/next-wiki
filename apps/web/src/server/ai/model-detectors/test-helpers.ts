import { vi } from 'vitest';
import type { DetectorRuntimeConfig } from './types';

/**
 * Build a detector runtime config for tests. Defaults produce a Cloudflare
 * config with account + token; override any field for other cases.
 */
export function detectorRuntime(overrides: Partial<DetectorRuntimeConfig> = {}): DetectorRuntimeConfig {
  return {
    source: 'cloudflare',
    providerId: '00000000-0000-4000-8000-000000000001',
    providerName: 'Fixture',
    providerType: 'chat',
    vendor: 'custom',
    accountId: 'acct-123',
    namespace: undefined,
    options: { includeDeprecated: false, hideExperimental: true },
    credentials: { apiKey: 'cf-token' },
    ...overrides,
  };
}

type FetchHandler = (url: string) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

/**
 * Stub global `fetch` with a URL-routed handler returning JSON. Returns the
 * mock so callers can assert on invocations. Auto-unstubbed via
 * `vi.unstubAllGlobals()` in the test's afterEach.
 */
export function stubFetch(handler: FetchHandler) {
  const mock = vi.fn(async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const { status = 200, body } = await handler(url);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A Cloudflare model-search result entry. */
export function cloudflareModel(
  name: string,
  taskName: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: name, name, description: `${name} model`, task: { name: taskName }, ...extra };
}

/** A Cloudflare model-schema result. */
export function cloudflareSchema(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): { result: { input: unknown; output: unknown }; success: boolean } {
  return {
    result: { input: { type: 'object', properties: input }, output: { type: 'object', properties: output } },
    success: true,
  };
}
