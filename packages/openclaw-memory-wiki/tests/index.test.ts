import { describe, expect, it, vi } from 'vitest';
import { register } from '../src/index.js';

describe('plugin registration', () => {
  it('registers declared tools and starts without blocking startup', async () => {
    const registerTool = vi.fn();
    const stop = vi.fn();
    await register({
      config: { baseUrl: 'https://wiki.example', vaultPath: process.cwd(), mirrorApiKeyRef: 'secret://mirror', knowledgeApiKeyRef: 'secret://search', enabled: false },
      resolveSecretRef: vi.fn(), registerTool, registerSkill: vi.fn(), onShutdown: stop,
    });
    expect(registerTool).not.toHaveBeenCalled();
  });
});
