import { describe, expect, it, vi } from 'vitest';
import { redactConfig, resolveConfig } from '../src/config.js';

describe('plugin configuration', () => {
  it('requires HTTPS or loopback and resolves secrets without exposing them', async () => {
    await expect(resolveConfig({ baseUrl: 'http://remote.example', vaultPath: process.cwd(), mirrorApiKeyRef: 'a', knowledgeApiKeyRef: 'b' }, async (ref) => String(ref))).rejects.toThrow('HTTPS');
    const resolved = await resolveConfig({ baseUrl: 'http://127.0.0.1:3000', vaultPath: process.cwd(), mirrorApiKeyRef: 'secret://mirror', knowledgeApiKeyRef: 'secret://search' }, vi.fn(async (ref) => `${ref}-value`));
    expect(redactConfig(resolved.config)).toMatchObject({ mirrorApiKeyRef: '[secret]', knowledgeApiKeyRef: '[secret]' });
    expect(redactConfig(resolved.config)).not.toHaveProperty('mirrorKey');
  });
});
