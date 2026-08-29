import { afterEach, describe, expect, it, vi } from 'vitest';
import plugin from '../src/index';

function stubApi(pluginConfig: Record<string, unknown>) {
  return {
    pluginConfig,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    runtime: { state: { resolveStateDir: vi.fn(), openKeyedStore: vi.fn() } },
    on: vi.fn(),
    registerTool: vi.fn(),
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

  it('registers no hooks or tools yet (bootstrap phase only)', () => {
    const api = stubApi({ wikiApiBaseUrl: 'https://wiki.example.com/api/v1', credential: 'nwk_secret' });
    plugin.register(api as never);
    expect(api.on).not.toHaveBeenCalled();
    expect(api.registerTool).not.toHaveBeenCalled();
  });
});
