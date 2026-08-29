import { describe, expect, it } from 'vitest';
import { AGENT_MEMORY_LIMITS, agentMemoryEvidenceInputSchema, agentMemoryRecallInputSchema, agentMemorySaveInputSchema, agentMemorySourceDocumentInputSchema, memoryWikiSourcePathSchema } from './agent-memory';

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

  it('accepts Memory Wiki paths while rejecting traversal and non-Markdown input', () => {
    expect(memoryWikiSourcePathSchema.safeParse('AGENTS.md').success).toBe(true);
    expect(memoryWikiSourcePathSchema.safeParse('entities/Alex.md').success).toBe(true);
    expect(memoryWikiSourcePathSchema.safeParse('../secrets.md').success).toBe(false);
    expect(memoryWikiSourcePathSchema.safeParse('entities/Alex.txt').success).toBe(false);
    expect(agentMemorySourceDocumentInputSchema.safeParse({ sourcePath: 'AGENTS.md', content: '# A', sourceDigest: 'a'.repeat(64), idempotencyKey: 'AGENTS.md:a' }).success).toBe(true);
    expect(agentMemorySourceDocumentInputSchema.safeParse({ sourcePath: 'AGENTS.md', content: '# A', sourceDigest: 'a'.repeat(64) }).success).toBe(false);
  });
});
