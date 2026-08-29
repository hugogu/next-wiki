import { describe, expect, it } from 'vitest';
import { apiKeyScopeSchema, openClawPairedKeyInputSchema } from './api-keys';

describe('API-key scopes', () => {
  it('includes the narrow image-generation scope', () => {
    expect(apiKeyScopeSchema.options).toContain('ai.image');
  });

  it('includes dedicated Agent memory scopes', () => {
    expect(apiKeyScopeSchema.options).toEqual(expect.arrayContaining(['memory.read', 'memory.write', 'memory.delete']));
  });

  it('normalizes the OpenClaw paired-key preset defaults', () => {
    expect(openClawPairedKeyInputSchema.parse({})).toMatchObject({ agentIdentity: 'openclaw', includeRaw: false, includeGenerated: false });
  });
});
