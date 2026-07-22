import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import { assertFullContextCapacity, estimateFullContextTokens } from '@/server/ai/retrieval/full-context';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { clearAiData } from '../../../test/ai-fixtures';
import { modelSupportsToolCalling } from './ai-question';

const source = (id: string, content: string): QuestionSource => ({
  id,
  pageId: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
  revisionId: `00000000-0000-4000-9000-${id.padStart(12, '0')}`,
  title: id,
  path: id,
  locale: 'en',
  revisionHash: id,
  content,
});

describe('full-context capacity', () => {
  it('uses a conservative deterministic estimate without truncation', () => {
    const sources = [source('1', 'a'.repeat(3_000)), source('2', '中文'.repeat(500))];
    expect(estimateFullContextTokens('question', sources)).toBe(estimateFullContextTokens('question', sources));
    expect(() => assertFullContextCapacity(100_000, 'question', sources)).not.toThrow();
    expect(() => assertFullContextCapacity(1_000, 'question', sources)).toThrowError(
      expect.objectContaining({ code: 'FULL_CONTEXT_TOO_LARGE' }),
    );
  });

  it('falls back to a conservative default when model capacity is unknown', () => {
    // A small Wiki still fits the conservative default window.
    expect(() => assertFullContextCapacity(null, 'question', [source('1', 'body')])).not.toThrow();
    // A Wiki that overflows even the conservative default is still rejected clearly.
    expect(() =>
      assertFullContextCapacity(null, 'question', [source('1', 'a'.repeat(30_000))]),
    ).toThrowError(expect.objectContaining({ code: 'FULL_CONTEXT_TOO_LARGE' }));
  });
});

describe('modelSupportsToolCalling', () => {
  beforeEach(async () => {
    await clearAiData();
  });

  afterAll(async () => {
    await closeDb();
  });

  async function createModel() {
    const [provider] = await db
      .insert(schema.aiProviders)
      .values({
        name: `provider-${crypto.randomUUID()}`,
        kind: 'openai_compatible',
        baseUrl: 'https://example.com/v1',
        credentialsEncrypted: 'encrypted',
        enabled: true,
        status: 'healthy',
      })
      .returning({ id: schema.aiProviders.id });
    const [model] = await db
      .insert(schema.aiModels)
      .values({
        providerId: provider!.id,
        externalId: `model-${crypto.randomUUID()}`,
        displayName: 'Test Model',
        availability: 'available',
      })
      .returning({ id: schema.aiModels.id });
    return model!.id;
  }

  it('allows tool chat when model capability metadata is missing', async () => {
    const modelId = await createModel();
    await expect(modelSupportsToolCalling(modelId)).resolves.toBe(true);
  });

  it('falls back only when capability metadata explicitly disables tool calling', async () => {
    const modelId = await createModel();
    await db.insert(schema.aiModelCapabilities).values({
      modelId,
      capability: 'tool_calling',
      supported: false,
      source: 'manual',
    });
    await expect(modelSupportsToolCalling(modelId)).resolves.toBe(false);
  });
});
