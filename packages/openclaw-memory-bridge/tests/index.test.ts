import { afterEach, describe, expect, it, vi } from 'vitest';
import plugin from '../src/index';

function stubApi(pluginConfig: Record<string, unknown>) {
  const stored = new Map<string, unknown>();
  return {
    pluginConfig,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    runtime: {
      state: {
        resolveStateDir: vi.fn(),
        openKeyedStore: vi.fn().mockReturnValue({
          register: vi.fn(async (key: string, value: unknown) => { stored.set(key, value); }),
          registerIfAbsent: vi.fn(async (key: string, value: unknown) => {
            if (stored.has(key)) return false;
            stored.set(key, value);
            return true;
          }),
          update: vi.fn(async () => true),
          lookup: vi.fn(async (key: string) => stored.get(key)),
          consume: vi.fn(async (key: string) => { const v = stored.get(key); stored.delete(key); return v; }),
          delete: vi.fn(async (key: string) => stored.delete(key)),
          entries: vi.fn(async () => [...stored.entries()].map(([key, value]) => ({ key, value }))),
          clear: vi.fn(async () => stored.clear()),
        }),
      },
    },
    on: vi.fn(),
    registerTool: vi.fn(),
    registerService: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('next-wiki-memory-bridge plugin entry', () => {
  it('declares a stable id distinct from any capability slot claim', () => {
    expect(plugin.id).toBe('next-wiki-memory-bridge');
    expect(plugin.name).toBeTruthy();
    expect(plugin.description).toBeTruthy();
  });

  it('activates with a valid configuration and logs no secret', () => {
    const api = stubApi({ wikiApiBaseUrl: 'https://wiki.example.com/api/v1', credential: 'nwk_super_secret' });
    plugin.register(api as never);
    expect(api.logger.error).not.toHaveBeenCalled();
    for (const call of api.logger.info.mock.calls) {
      expect(String(call[0])).not.toContain('nwk_super_secret');
    }
  });

  it('throws and logs a redacted message on invalid configuration', () => {
    const api = stubApi({ wikiApiBaseUrl: 'not-a-url', credential: 'nwk_super_secret' });
    expect(() => plugin.register(api as never)).toThrow();
    expect(api.logger.error).toHaveBeenCalled();
    for (const call of api.logger.error.mock.calls) {
      expect(String(call[0])).not.toContain('nwk_super_secret');
    }
  });

  it('registers no hooks, service, or tools when capture is left at its safe default (disabled)', () => {
    const api = stubApi({ wikiApiBaseUrl: 'https://wiki.example.com/api/v1', credential: 'nwk_secret' });
    plugin.register(api as never);
    expect(api.on).not.toHaveBeenCalled();
    expect(api.registerTool).not.toHaveBeenCalled();
    expect(api.registerService).not.toHaveBeenCalled();
  });

  it('registers capture hooks and the delivery service only when the operator explicitly enables capture', () => {
    const api = stubApi({
      wikiApiBaseUrl: 'https://wiki.example.com/api/v1',
      credential: 'nwk_secret',
      capture: { enabled: true, modes: ['turn'] },
    });
    plugin.register(api as never);
    expect(api.on).toHaveBeenCalledWith('agent_end', expect.any(Function));
    expect(api.registerService).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringContaining('next-wiki-memory-bridge') }));
    expect(api.registerTool).not.toHaveBeenCalled();
  });
});
