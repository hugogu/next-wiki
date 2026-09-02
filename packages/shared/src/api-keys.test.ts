import { describe, expect, it } from 'vitest';
import { apiKeyScopeSchema, createApiKeyInputSchema } from './api-keys';

describe('API-key scopes', () => {
  it('includes the narrow image-generation scope', () => {
    expect(apiKeyScopeSchema.options).toContain('ai.image');
  });

  it('includes dedicated Agent memory scopes', () => {
    expect(apiKeyScopeSchema.options).toEqual(expect.arrayContaining(['memory.read', 'memory.write', 'memory.delete']));
  });

  it('allows a memory provider key to combine memory and content capabilities', () => {
    expect(createApiKeyInputSchema.parse({
      name: 'OpenClaw connection',
      scopes: ['view', 'memory.read', 'memory.write'],
      spaceAccess: ['wiki', 'raw'],
      memoryProvider: { agentIdentity: 'openclaw' },
    })).toMatchObject({
      scopes: ['view', 'memory.read', 'memory.write'],
      spaceAccess: ['wiki', 'raw'],
      memoryProvider: { agentIdentity: 'openclaw' },
    });
  });
});
