import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import { assertFullContextCapacity, estimateFullContextTokens } from '@/server/ai/retrieval/full-context';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { readActionInput } from '@/server/services/ai-actions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';

const jobsRuntime = vi.hoisted(() => ({
  enqueue: vi.fn(async (_queue: string, _data: Record<string, unknown>, _options?: unknown) => 'job-id'),
}));
vi.mock('@/server/jobs/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/jobs/runtime')>();
  return { ...actual, enqueue: jobsRuntime.enqueue };
});

import { createToolEnabledWikiQuestion, modelSupportsToolCalling } from './ai-question';

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
    jobsRuntime.enqueue.mockClear();
  });

  afterAll(async () => {
    await closeDb();
  });

  async function createModel() {
    const [provider] = await db
      .insert(schema.aiProviders)
      .values({
        name: `provider-${randomUUID()}`,
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
        externalId: `model-${randomUUID()}`,
        displayName: 'Test Model',
        availability: 'available',
      })
      .returning({ id: schema.aiModels.id });
    return model!.id;
  }

  async function assignWikiTextModel(modelId: string) {
    await db.insert(schema.aiPurposeAssignments).values({ purpose: 'wiki_text', modelId });
  }

  it('allows tool-enabled questions when model capability metadata is missing', async () => {
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

  it('creates tool-enabled questions as the canonical wiki_question action feature', async () => {
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    const userId = await createAiTestUser('admin');
    try {
      const modelId = await createModel();
      await assignWikiTextModel(modelId);

      const result = await createToolEnabledWikiQuestion(buildUserCtx(userId, 'admin'), {
        question: 'Write the above into a page',
        mode: 'retrieval',
        requestedReview: 'admin_review',
        conversation: [{ question: 'Summarize it', answer: 'Summary body' }],
        requestMetadata: { origin: 'web' },
      });

      expect(result.fallback).toBe(false);
      if (result.fallback) throw new Error('expected tool-enabled question action');
      expect(result.action.feature).toBe('wiki_question');
      const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, result.action.id) });
      expect(row).toMatchObject({
        feature: 'wiki_question',
        questionMode: 'retrieval',
        requestMetadata: expect.objectContaining({ origin: 'web', toolEnabled: true, requestedReview: 'admin_review' }),
      });
      await expect(readActionInput(result.action.id)).resolves.toMatchObject({
        question: 'Write the above into a page',
        mode: 'retrieval',
      });
    } finally {
      await clearAiData();
      await removeAiTestUser(userId);
    }
  });
});
