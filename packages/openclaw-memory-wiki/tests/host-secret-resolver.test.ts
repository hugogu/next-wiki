import { describe, expect, it, vi } from 'vitest';
import { register } from '../src/index.js';

// Tests for the `hostSecretResolver` literal-string pass-through behaviour added
// in 0.1.2: the OpenClaw runtime may pre-resolve SecretRefs in plugin config
// before invoking register(). When that happens, `apiKeyRef` arrives as the
// already-resolved literal value (a non-empty string) instead of a SecretRef
// object, and the plugin must pass it through without consulting a secret
// backend.
//
// Two resolver paths are exercised:
//   1. `api.resolveSecretRef` set -> the host resolver is used as-is.
//   2. `api.resolveSecretRef` absent -> the plugin falls back to
//      `resolveRequiredConfiguredSecretRefInputString`, which returns undefined
//      for non-SecretRef-shaped strings and throws for unresolvable refs.

type Cfg = Record<string, unknown>;

interface Harness {
  registerTool: ReturnType<typeof vi.fn>;
  registerService: ReturnType<typeof vi.fn>;
  logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  service: { start: () => Promise<void>; stop: () => void };
}

function startOnce(cfg: Cfg, resolveSecretRef?: (ref: unknown) => Promise<string>): Harness {
  const registerTool = vi.fn();
  const registerService = vi.fn();
  const logger = { warn: vi.fn(), error: vi.fn() };
  register({
    config: { baseUrl: 'https://wiki.example', vaultPath: process.cwd(), enabled: true, ...cfg },
    ...(resolveSecretRef ? { resolveSecretRef: resolveSecretRef as never } : {}),
    registerTool,
    registerSkill: vi.fn(),
    registerService,
    logger,
  });
  const service = registerService.mock.calls[0]?.[0] as { start: () => Promise<void>; stop: () => void };
  return { registerTool, registerService, logger, service };
}

describe('hostSecretResolver accepts both SecretRef and pre-resolved literal inputs', () => {
  it('resolves a SecretRef object via api.resolveSecretRef', async () => {
    const resolveSecretRef = vi.fn(async () => 'resolved-secret-value');
    const h = startOnce({ apiKeyRef: { source: 'env', provider: 'default', id: 'MY_KEY' } }, resolveSecretRef);
    await h.service.start();
    expect(resolveSecretRef).toHaveBeenCalledWith({ source: 'env', provider: 'default', id: 'MY_KEY' });
    expect(h.logger.error).not.toHaveBeenCalled();
    h.service.stop();
  });

  it('resolves an env shorthand ref like "$MY_KEY" via api.resolveSecretRef', async () => {
    const resolveSecretRef = vi.fn(async () => 'shorthand-value');
    const h = startOnce({ apiKeyRef: '$MY_KEY' }, resolveSecretRef);
    await h.service.start();
    expect(resolveSecretRef).toHaveBeenCalledWith('$MY_KEY');
    expect(h.logger.error).not.toHaveBeenCalled();
    h.service.stop();
  });

  it('passes through a pre-resolved literal when api.resolveSecretRef is absent', async () => {
    // 'nwk_...' does not match any SecretRef shape, so the fallback resolver
    // should return it as-is without touching a secret backend.
    const h = startOnce({ apiKeyRef: 'nwk_pre_resolved_literal_token' });
    await h.service.start();
    expect(h.logger.error).not.toHaveBeenCalled();
    h.service.stop();
  });

  it('surfaces an error when a SecretRef-shaped input cannot be resolved by the fallback', async () => {
    // '$MISSING_KEY' parses as an env SecretRef; env var MISSING_KEY is not set,
    // so the fallback resolver must throw and the startup must report
    // 'api_key_resolution_failed' (message contains "SecretRef").
    const h = startOnce({ apiKeyRef: '$MISSING_KEY' });
    await h.service.start();
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('api_key_resolution_failed'));
    h.service.stop();
  });
});
