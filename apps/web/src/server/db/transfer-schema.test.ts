import { describe, expect, it } from 'vitest';
import * as schema from './schema';

describe('content transfer schema', () => {
  it('registers every durable transfer entity', () => {
    expect(schema.transferSources).toBeDefined();
    expect(schema.transferRuns).toBeDefined();
    expect(schema.transferItems).toBeDefined();
    expect(schema.transferArtifacts).toBeDefined();
    expect(schema.transferPageMappings).toBeDefined();
    expect(schema.transferAssetMappings).toBeDefined();
  });
});
