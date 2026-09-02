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
});
