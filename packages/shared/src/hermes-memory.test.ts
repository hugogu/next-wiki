import { describe, expect, it } from 'vitest';
import { HERMES_MEMORY_LIMITS, hermesMemoryEvidenceInputSchema, hermesMemoryRecallInputSchema, hermesMemorySaveInputSchema } from './hermes-memory';

describe('Hermes memory contracts', () => {
  it('bounds recall and write payloads', () => {
    expect(hermesMemoryRecallInputSchema.safeParse({ query: 'decision', limit: HERMES_MEMORY_LIMITS.maxRecallResults }).success).toBe(true);
    expect(hermesMemoryRecallInputSchema.safeParse({ query: 'decision', limit: HERMES_MEMORY_LIMITS.maxRecallResults + 1 }).success).toBe(false);
    expect(hermesMemorySaveInputSchema.safeParse({ idempotencyKey: 'key', content: 'memory' }).success).toBe(true);
  });

  it('admits only normalized user and assistant evidence', () => {
    expect(hermesMemoryEvidenceInputSchema.safeParse({
      idempotencyKey: 'checkpoint', sessionDigest: 'a'.repeat(64), checkpoint: true,
      messages: [{ role: 'user', content: 'keep this' }],
    }).success).toBe(true);
    expect(hermesMemoryEvidenceInputSchema.safeParse({
      idempotencyKey: 'checkpoint', sessionDigest: 'a'.repeat(64), checkpoint: true,
      messages: [{ role: 'tool', content: 'do not retain' }],
    }).success).toBe(false);
  });
});
