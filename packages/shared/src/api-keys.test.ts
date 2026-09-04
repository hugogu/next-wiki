import { describe, expect, it } from 'vitest';
import { apiKeyScopeSchema, createApiKeyInputSchema, updateApiKeyInputSchema } from './api-keys';

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

  it('accepts partial updates to scopes or space access, but not an empty update', () => {
    expect(updateApiKeyInputSchema.parse({ scopes: ['view', 'edit'] })).toEqual({ scopes: ['view', 'edit'] });
    expect(updateApiKeyInputSchema.parse({ spaceAccess: ['wiki', 'raw'] })).toEqual({ spaceAccess: ['wiki', 'raw'] });
    expect(updateApiKeyInputSchema.safeParse({}).success).toBe(false);
  });
});
