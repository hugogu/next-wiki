import { describe, expect, it } from 'vitest';
import { apiKeyScopeSchema, openClawKeyInputSchema } from './api-keys';

describe('API-key scopes', () => {
  it('includes the narrow image-generation scope', () => {
    expect(apiKeyScopeSchema.options).toContain('ai.image');
  });

  it('includes dedicated Agent memory scopes', () => {
    expect(apiKeyScopeSchema.options).toEqual(expect.arrayContaining(['memory.read', 'memory.write', 'memory.delete']));
  });

  it('normalizes the single OpenClaw key preset defaults', () => {
    expect(openClawKeyInputSchema.parse({})).toMatchObject({
      agentIdentity: 'openclaw',
      scopes: ['view', 'memory.read', 'memory.write'],
      spaceAccess: ['wiki'],
    });
  });
});
