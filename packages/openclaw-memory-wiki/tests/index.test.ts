import { describe, expect, it, vi } from 'vitest';
import { register } from '../src/index.js';

describe('plugin registration', () => {
  it('registers declared tools and starts without blocking startup', async () => {
    const registerTool = vi.fn();
    const stop = vi.fn();
    await register({
      config: { baseUrl: 'https://wiki.example', vaultPath: process.cwd(), apiKeyRef: 'secret://openclaw', enabled: false },
      resolveSecretRef: vi.fn(), registerTool, registerSkill: vi.fn(), onShutdown: stop,
    });
    expect(registerTool).not.toHaveBeenCalled();
  });

  it('keeps registration synchronous and contains deferred startup failures', async () => {
    const registerTool = vi.fn();
    const registerService = vi.fn();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const definitions = new Map<string, { execute: (...args: never[]) => Promise<{ details: unknown }> }>();
    registerTool.mockImplementation((definition: { name: string; execute: (...args: never[]) => Promise<{ details: unknown }> }) => {
      definitions.set(definition.name, definition);
    });

    const result = register({
      config: { baseUrl: 'https://wiki.example', vaultPath: '/missing/openclaw-vault', apiKeyRef: 'secret://openclaw', enabled: true },
      resolveSecretRef: vi.fn(async () => 'secret'),
      registerTool,
      registerService,
      logger,
    });

    expect(result).toBeUndefined();
    expect(registerService).toHaveBeenCalledOnce();
    const service = registerService.mock.calls[0]?.[0] as { start: () => Promise<void>; stop: () => void };
    await expect(service.start()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('vaultPath must point to an existing directory'));

    const status = await definitions.get('next_wiki_status')?.execute();
    expect(status?.details).toMatchObject({ state: 'degraded', lastError: 'vaultPath must point to an existing directory' });
    service.stop();
  });

  it('contains asynchronous SecretRef failures from the host resolver', async () => {
    const registerService = vi.fn();
    const logger = { warn: vi.fn(), error: vi.fn() };

    register({
      config: { baseUrl: 'https://wiki.example', vaultPath: process.cwd(), apiKeyRef: 'secret://openclaw', enabled: true },
      resolveSecretRef: vi.fn(async () => { throw new Error('secret backend unavailable'); }),
      registerTool: vi.fn(),
      registerService,
      logger,
    });

    const service = registerService.mock.calls[0]?.[0] as { start: () => Promise<void>; stop: () => void };
    await expect(service.start()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('api_key_resolution_failed'));
    service.stop();
  });
});
