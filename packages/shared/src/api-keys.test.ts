import { describe, expect, it } from 'vitest';
import { apiKeyScopeSchema } from './api-keys';

describe('API-key scopes', () => {
  it('includes the narrow image-generation scope', () => {
    expect(apiKeyScopeSchema.options).toContain('ai.image');
  });
});
