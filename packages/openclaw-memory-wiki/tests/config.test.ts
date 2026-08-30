import { describe, expect, it, vi } from 'vitest';
import { redactConfig, resolveConfig } from '../src/config.js';

describe('plugin configuration', () => {
  it('requires HTTPS or loopback and resolves secrets without exposing them', async () => {
    await expect(resolveConfig({ baseUrl: 'http://remote.example', vaultPath: process.cwd(), mirrorApiKeyRef: 'a', knowledgeApiKeyRef: 'b' }, async (ref) => String(ref))).rejects.toThrow('HTTPS');
    const resolved = await resolveConfig({ baseUrl: 'http://127.0.0.1:3000', vaultPath: process.cwd(), mirrorApiKeyRef: 'secret://mirror', knowledgeApiKeyRef: 'secret://search' }, vi.fn(async (ref) => `${ref}-value`));
    expect(redactConfig(resolved.config)).toMatchObject({ mirrorApiKeyRef: '[secret]', knowledgeApiKeyRef: '[secret]' });
    expect(redactConfig(resolved.config)).not.toHaveProperty('mirrorKey');
  });

  it('rejects invalid synchronization intervals and missing SecretRefs', async () => {
    const resolveSecret = vi.fn(async (ref) => String(ref));
    await expect(resolveConfig({ baseUrl: 'https://wiki.example', vaultPath: process.cwd(), mirrorApiKeyRef: 'a', knowledgeApiKeyRef: 'b', syncIntervalMinutes: 0 }, resolveSecret)).rejects.toThrow('between 1 and 1440');
    await expect(resolveConfig({ baseUrl: 'https://wiki.example', vaultPath: process.cwd(), mirrorApiKeyRef: 'a' }, resolveSecret)).rejects.toThrow('Both API key SecretRefs are required');
  });
});
