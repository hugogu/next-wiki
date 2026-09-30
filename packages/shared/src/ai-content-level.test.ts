import { describe, expect, it } from 'vitest';
import { deriveAiContentLevel, publicPageSearchQuerySchema } from './pages';
import { agentMemoryWikiSearchInputSchema } from './agent-memory';

describe('page AI attribution', () => {
  it('keeps human/original content unmarked and preserves human edits to generated content', () => {
    expect(deriveAiContentLevel('original', false)).toBeNull();
    expect(deriveAiContentLevel('original', true)).toBeNull();
    expect(deriveAiContentLevel('generated', false)).toBe('generated');
    expect(deriveAiContentLevel('generated', true)).toBe('assisted');
  });

  it.each([publicPageSearchQuerySchema, agentMemoryWikiSearchInputSchema])('parses false query flags without boolean coercion', (schema) => {
    expect(schema.parse({ q: 'test', includeAiGenerated: 'false', includeAiAssisted: 'true' }))
      .toMatchObject({ includeAiGenerated: false, includeAiAssisted: true });
    expect(schema.parse({ q: 'test' }).includeAiGenerated).toBeUndefined();
    expect(schema.safeParse({ q: 'test', includeAiGenerated: '0' }).success).toBe(false);
  });
});
