import { describe, expect, it, vi } from 'vitest';
import { redactConfig, resolveConfig } from '../src/config.js';

describe('plugin configuration', () => {
  it('requires HTTPS or loopback and resolves secrets without exposing them', async () => {
    await expect(resolveConfig({ baseUrl: 'http://remote.example', vaultPath: process.cwd(), apiKeyRef: 'a' }, async (ref) => String(ref))).rejects.toThrow('HTTPS');
    const resolved = await resolveConfig({ baseUrl: 'http://127.0.0.1:3000', vaultPath: process.cwd(), apiKeyRef: 'secret://openclaw' }, vi.fn(async (ref) => `${ref}-value`));
    expect(redactConfig(resolved.config)).toMatchObject({ apiKeyRef: '[secret]' });
    expect(redactConfig(resolved.config)).not.toHaveProperty('apiKey');
  });

  it('rejects invalid synchronization intervals and missing SecretRefs', async () => {
    const resolveSecret = vi.fn(async (ref) => String(ref));
    await expect(resolveConfig({ baseUrl: 'https://wiki.example', vaultPath: process.cwd(), apiKeyRef: 'a', syncIntervalMinutes: 0 }, resolveSecret)).rejects.toThrow('between 1 and 1440');
    await expect(resolveConfig({ baseUrl: 'https://wiki.example', vaultPath: process.cwd() }, resolveSecret)).rejects.toThrow('API key SecretRef is required');
  });

  it('normalizes a baseUrl copied from the API docs, which already carries /api/v1', async () => {
    const resolveSecret = vi.fn(async (ref) => String(ref));
    for (const baseUrl of ['https://wiki.example/api/v1', 'https://wiki.example/api/v1/', 'https://wiki.example/api/']) {
      const resolved = await resolveConfig({ baseUrl, vaultPath: process.cwd(), apiKeyRef: 'a' }, resolveSecret);
      expect(resolved.config.baseUrl).toBe('https://wiki.example');
    }
    // Bare origins and non-API subpaths are left untouched.
    const trailing = await resolveConfig({ baseUrl: 'https://wiki.example/', vaultPath: process.cwd(), apiKeyRef: 'a' }, resolveSecret);
    expect(trailing.config.baseUrl).toBe('https://wiki.example');
    const subpath = await resolveConfig({ baseUrl: 'https://wiki.example/docs', vaultPath: process.cwd(), apiKeyRef: 'a' }, resolveSecret);
    expect(subpath.config.baseUrl).toBe('https://wiki.example/docs');
  });
});
