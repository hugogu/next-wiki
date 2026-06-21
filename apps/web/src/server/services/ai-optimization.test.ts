import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';

const streamText = vi.hoisted(() => vi.fn());
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: () => ({ streamText }),
}));
vi.mock('@/server/services/ai-admin', async (original) => {
  const actual = await original<typeof import('./ai-admin')>();
  return {
    ...actual,
    providerRuntime: vi.fn(async () => ({
      providerId: 'provider',
      name: 'Fixture',
      kind: 'openai_compatible',
      baseUrl: 'https://example.com',
      config: {},
      credentials: { apiKey: 'hidden' },
    })),
  };
});

import { createTextOptimization, selectionHash } from './ai-optimization';
import { runTextOptimizationAction } from '@/server/jobs/ai-optimization';

describe('AI text optimization', () => {
  let editorId: string;
  let readerId: string;
  let pageId: string;
  let revisionId: string;
  let spaceId: string;
  beforeEach(async () => {
    await clearAiData();
    streamText.mockReset();
    streamText.mockImplementation(async function* () {
      yield { type: 'delta', text: 'Improved text' };
      yield { type: 'usage', inputTokens: 4, outputTokens: 2 };
    });
    editorId = await createAiTestUser('editor');
    readerId = await createAiTestUser('reader');
    pageId = randomUUID();
    revisionId = randomUUID();
    spaceId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `optimization-${spaceId}`, name: 'Optimization' });
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'page', path: 'page', title: 'Page', authorId: editorId,
      latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: 'Selected text',
      contentHtml: '<p>Selected text</p>', contentHash: 'hash', authorId: editorId,
    });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    await db.insert(schema.userAiEntitlements).values({ userId: editorId, textOptimizationEnabled: true, updatedBy: editorId });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Text provider', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', status: 'healthy', createdBy: editorId, updatedBy: editorId,
    }).returning();
    const [model] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'text', displayName: 'Text',
      availability: 'available', contextWindow: 8_000,
    }).returning();
    await db.insert(schema.aiPurposeAssignments).values({ purpose: 'wiki_text', modelId: model!.id, updatedBy: editorId });
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(readerId);
    await removeAiTestUser(editorId);
  });

  it('returns replacement-only output without writing a revision', async () => {
    const before = await db.query.pageRevisions.findMany({ where: eq(schema.pageRevisions.pageId, pageId) });
    const action = await createTextOptimization(buildUserCtx(editorId, 'editor'), {
      pageId,
      revisionId,
      selection: { text: 'Selected text', hash: selectionHash('Selected text'), from: 0, to: 13 },
      instruction: 'improve_clarity',
    });
    await runTextOptimizationAction(action.id);
    const events = await db.query.aiActionEvents.findMany({
      where: eq(schema.aiActionEvents.actionId, action.id),
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'optimization',
      payload: expect.objectContaining({ replacement: 'Improved text' }),
    }));
    expect(await db.query.pageRevisions.findMany({ where: eq(schema.pageRevisions.pageId, pageId) })).toHaveLength(before.length);
  });

  it('rejects Readers, stale hashes, and oversized input before provider execution', async () => {
    const base = {
      pageId,
      revisionId,
      selection: { text: 'Selected text', hash: selectionHash('Selected text'), from: 0, to: 13 },
      instruction: 'improve_clarity' as const,
    };
    await expect(createTextOptimization(buildUserCtx(readerId, 'reader'), base)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createTextOptimization(buildUserCtx(editorId, 'editor'), {
      ...base,
      selection: { ...base.selection, hash: '0'.repeat(64) },
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const oversized = 'x'.repeat(100_001);
    await expect(createTextOptimization(buildUserCtx(editorId, 'editor'), {
      ...base,
      selection: { text: oversized, hash: selectionHash(oversized), from: 0, to: oversized.length },
    })).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
    expect(streamText).not.toHaveBeenCalled();
  });
});
