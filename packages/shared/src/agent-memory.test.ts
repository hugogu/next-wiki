import { describe, expect, it } from 'vitest';
import { AGENT_MEMORY_LIMITS, agentMemoryEvidenceInputSchema, agentMemoryRecallInputSchema, agentMemorySaveInputSchema } from './agent-memory';

describe('Agent memory contracts', () => {
  it('bounds recall and write payloads', () => {
    expect(agentMemoryRecallInputSchema.safeParse({ query: 'decision', limit: AGENT_MEMORY_LIMITS.maxRecallResults }).success).toBe(true);
    expect(agentMemoryRecallInputSchema.safeParse({ query: 'decision', limit: AGENT_MEMORY_LIMITS.maxRecallResults + 1 }).success).toBe(false);
    expect(agentMemorySaveInputSchema.safeParse({ idempotencyKey: 'key', content: 'memory' }).success).toBe(true);
  });

  it('admits only normalized user and assistant evidence', () => {
    expect(agentMemoryEvidenceInputSchema.safeParse({
      idempotencyKey: 'checkpoint', sessionDigest: 'a'.repeat(64), checkpoint: true,
      messages: [{ role: 'user', content: 'keep this' }],
    }).success).toBe(true);
    expect(agentMemoryEvidenceInputSchema.safeParse({
      idempotencyKey: 'checkpoint', sessionDigest: 'a'.repeat(64), checkpoint: true,
      messages: [{ role: 'tool', content: 'do not retain' }],
    }).success).toBe(false);
  });
});
