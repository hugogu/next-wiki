import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { createIndexRebuild, refreshIndexCounters, retryIndexPages } from './ai-index';

describe('AI index lifecycle', () => {
  let adminId: string;
  let spaceId: string;
  let pageId: string;
  let revisionId: string;
  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
    spaceId = randomUUID();
    pageId = randomUUID();
    revisionId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `ai-index-${spaceId}`, name: 'AI index' });
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'page', path: 'page', title: 'Page', authorId: adminId,
      currentPublishedVersionId: revisionId, latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: 'body', contentHtml: '<p>body</p>',
      contentHash: 'hash', authorId: adminId, status: 'published', publishedAt: new Date(),
    });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Index fixture', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', status: 'healthy', createdBy: adminId, updatedBy: adminId,
    }).returning();
    const [model] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'embed', displayName: 'Embed',
      availability: 'available', embeddingDimensions: 3,
    }).returning();
    await db.insert(schema.aiPurposeAssignments).values({ purpose: 'wiki_embedding', modelId: model!.id, updatedBy: adminId });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(adminId);
  });

  it('builds, retries, and atomically activates a generation', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await createIndexRebuild(ctx, 'test');
    expect(created.generation.embeddingDimensions).toBe(3);
    expect(await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.generationId, created.generation.id),
    })).toMatchObject({ targetRevisionId: revisionId, status: 'pending' });
    await db.update(schema.aiPageIndexStates).set({ status: 'failed' }).where(eq(schema.aiPageIndexStates.generationId, created.generation.id));
    await retryIndexPages(ctx, created.generation.id, []);
    await db.update(schema.aiPageIndexStates).set({ status: 'completed' }).where(eq(schema.aiPageIndexStates.generationId, created.generation.id));
    await refreshIndexCounters(created.generation.id);
    expect(await db.query.aiIndexGenerations.findFirst({
      where: eq(schema.aiIndexGenerations.id, created.generation.id),
    })).toMatchObject({ status: 'ready', isActive: true });
  });
});
