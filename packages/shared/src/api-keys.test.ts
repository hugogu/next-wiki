import { describe, expect, it } from 'vitest';
import { apiKeyScopeSchema } from './api-keys';

describe('API-key scopes', () => {
  it('includes the narrow image-generation scope', () => {
    expect(apiKeyScopeSchema.options).toContain('ai.image');
  });

  it('includes dedicated Hermes memory scopes', () => {
    expect(apiKeyScopeSchema.options).toEqual(expect.arrayContaining(['memory.read', 'memory.write', 'memory.delete']));
  });
});
