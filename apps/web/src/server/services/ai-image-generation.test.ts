import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { decryptAiJson } from '@/server/crypto/ai-encryption';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { selectionHash } from './ai-optimization';

const generateImage = vi.hoisted(() => vi.fn());
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: () => ({ generateImage }),
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

import { createImageGeneration } from './ai-image-generation';
import { executeImageGenerationAction, runInlineImageGenerationAction } from './ai-image-runner';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2jZsAAAAASUVORK5CYII=';

describe('AI image generation', () => {
  let editorId: string;
  let pageId: string;
  let revisionId: string;
  let spaceId: string;
  beforeEach(async () => {
    await clearAiData();
    generateImage.mockReset();
    generateImage.mockResolvedValue({ kind: 'data_url', dataUrl: PNG_DATA_URL });
    editorId = await createAiTestUser('editor');
    pageId = randomUUID();
    revisionId = randomUUID();
    spaceId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `image-${spaceId}`, name: 'Image' });
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'page', path: 'page', title: 'Image page', authorId: editorId,
      latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: '# Page\n\nContent',
      contentHtml: '<h1>Page</h1>', contentHash: 'hash', authorId: editorId,
    });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    await db.insert(schema.userAiEntitlements).values({ userId: editorId, imageGenerationEnabled: true, updatedBy: editorId });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Image provider', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', status: 'healthy', createdBy: editorId, updatedBy: editorId,
    }).returning();
    const [model] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'image', displayName: 'Image',
      availability: 'available',
    }).returning();
    await db.insert(schema.aiPurposeAssignments).values({ purpose: 'wiki_image', modelId: model!.id, updatedBy: editorId });
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(
      inArray(
        schema.pageRevisions.pageId,
        db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.spaceId, spaceId)),
      ),
    );
    await db.delete(schema.pages).where(eq(schema.pages.spaceId, spaceId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(editorId);
  });

  it('uses the assigned model and persists a bounded private artifact', async () => {
    const action = await createImageGeneration(buildUserCtx(editorId, 'editor'), {
      pageId,
      revisionId,
      source: { kind: 'selection', text: 'Selected subject', hash: selectionHash('Selected subject') },
      aspectRatio: '16:9',
    }, { enqueue: false });
    await executeImageGenerationAction(action.id);
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: '16:9' }));
    const artifact = await db.query.aiGeneratedArtifacts.findFirst({
      where: eq(schema.aiGeneratedArtifacts.actionId, action.id),
    });
    expect(artifact).toMatchObject({ contentType: 'image/png' });
    expect(decryptAiJson(artifact!.placementPayloadEncrypted!)).toEqual({
      revisionId,
      source: { kind: 'selection', text: 'Selected subject', hash: selectionHash('Selected subject') },
    });
  });

  it('rejects a mismatched selection hash before provider execution', async () => {
    await expect(createImageGeneration(buildUserCtx(editorId, 'editor'), {
      pageId,
      revisionId,
      source: { kind: 'selection', text: 'Selected subject', hash: '0'.repeat(64) },
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('honors a cancellation request before calling the provider', async () => {
    const action = await createImageGeneration(buildUserCtx(editorId, 'editor'), {
      pageId,
      revisionId,
      source: { kind: 'page' },
    }, { enqueue: false });
    await db.update(schema.aiActions).set({ cancelRequested: true }).where(eq(schema.aiActions.id, action.id));

    await expect(executeImageGenerationAction(action.id)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('illustrates a link page from its generated target, not from its empty placeholder revision', async () => {
    const linkPageId = randomUUID();
    const linkRevisionId = randomUUID();
    await db.update(schema.pages).set({ currentPublishedVersionId: revisionId }).where(eq(schema.pages.id, pageId));
    await db.insert(schema.pages).values({
      id: linkPageId, spaceId, slug: 'link', path: 'link', title: 'Link page', authorId: editorId,
      kind: 'link', linkTargetPageId: pageId, latestVersionId: linkRevisionId,
      currentPublishedVersionId: linkRevisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: linkRevisionId, pageId: linkPageId, versionNumber: 1, contentSource: null,
      contentHtml: '', contentHash: 'link-hash', authorId: editorId, linkTargetPageId: pageId,
      status: 'published',
    });

    const action = await createImageGeneration(buildUserCtx(editorId, 'editor'), {
      pageId: linkPageId,
      revisionId: linkRevisionId,
      source: { kind: 'page' },
    }, { enqueue: false });
    await executeImageGenerationAction(action.id);

    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Content'),
    }));
  });

  it('runs a child action inline without requiring a duplicate queue job', async () => {
    const action = await createImageGeneration(buildUserCtx(editorId, 'editor'), {
      pageId,
      revisionId,
      source: { kind: 'page' },
    }, { enqueue: false });

    await runInlineImageGenerationAction(action.id);

    const stored = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action.id) });
    expect(stored?.status).toBe('completed');
    expect(await db.query.aiGeneratedArtifacts.findFirst({ where: eq(schema.aiGeneratedArtifacts.actionId, action.id) })).toBeDefined();
  });

});
