import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { exactCosineSearch } from '@/server/ai/retrieval/vector-search';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { retrieve } from './ai-retrieval';

describe('AI vector retrieval', () => {
  it('ranks exact cosine matches, groups pages, and excludes unpublished content', async () => {
    await clearAiData();
    const userId = await createAiTestUser('admin');
    const spaceId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `retrieval-${spaceId}`, name: 'Retrieval' });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Retrieval fixture', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', createdBy: userId, updatedBy: userId,
    }).returning();
    const [model] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'embed', displayName: 'Embed',
      availability: 'available', embeddingDimensions: 3,
    }).returning();
    const [generation] = await db.insert(schema.aiIndexGenerations).values({
      modelId: model!.id, embeddingDimensions: 3, chunkerVersion: 'test', status: 'ready', isActive: true,
    }).returning();
    const ids = Array.from({ length: 3 }, () => ({ page: randomUUID(), revision: randomUUID() }));
    for (const [index, id] of ids.entries()) {
      await db.insert(schema.pages).values({
        id: id.page, spaceId, slug: `p${index}`, path: `p${index}`, title: `Page ${index}`,
        authorId: userId, currentPublishedVersionId: index === 2 ? null : id.revision, latestVersionId: id.revision,
      });
      await db.insert(schema.pageRevisions).values({
        id: id.revision, pageId: id.page, versionNumber: 1, contentSource: `content ${index}`,
        contentHtml: `<p>${index}</p>`, contentHash: `hash-${index}`, authorId: userId,
        status: index === 2 ? 'draft' : 'published', publishedAt: index === 2 ? null : new Date(),
      });
      await db.insert(schema.aiKnowledgeChunks).values({
        generationId: generation!.id, pageId: id.page, revisionId: id.revision,
        chunkIndex: 0, contentText: `content ${index}`, contentHash: `chunk-${index}`,
        byteCount: 9, embedding: index === 0 ? [1, 0, 0] : index === 1 ? [0.8, 0.2, 0] : [1, 0, 0],
      });
    }
    expect((await exactCosineSearch(generation!.id, [1, 0, 0], 10)).map((row) => row.pageId)).toEqual([
      ids[0]!.page,
      ids[1]!.page,
    ]);
    const grouped = await retrieve(buildUserCtx(userId, 'admin'), generation!.id, [1, 0, 0], 1);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ pageId: ids[0]!.page, excerpt: 'content 0' });

    await clearAiData();
    for (const id of ids) {
      await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.id, id.revision));
      await db.delete(schema.pages).where(eq(schema.pages.id, id.page));
    }
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(userId);
  });

  it('filters out results the caller cannot read (FR-009 regression)', async () => {
    await clearAiData();
    const userId = await createAiTestUser('reader');
    const spaceId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `retrieval-${spaceId}`, name: 'Retrieval', anonymousRead: false });
    const [provider] = await db.insert(schema.aiProviders).values({
      name: 'Retrieval fixture', kind: 'openai_compatible', baseUrl: 'https://example.com',
      credentialsEncrypted: 'encrypted', createdBy: userId, updatedBy: userId,
    }).returning();
    const [model] = await db.insert(schema.aiModels).values({
      providerId: provider!.id, externalId: 'embed', displayName: 'Embed',
      availability: 'available', embeddingDimensions: 3,
    }).returning();
    const [generation] = await db.insert(schema.aiIndexGenerations).values({
      modelId: model!.id, embeddingDimensions: 3, chunkerVersion: 'test', status: 'ready', isActive: true,
    }).returning();
    const pageId = randomUUID();
    const revisionId = randomUUID();
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'unreadable', path: 'unreadable', title: 'Unreadable',
      authorId: userId, currentPublishedVersionId: revisionId, latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: 'secret content',
      contentHtml: '<p>secret content</p>', contentHash: 'hash-secret', authorId: userId,
      status: 'published', publishedAt: new Date(),
    });
    const chunkId = randomUUID();
    await db.insert(schema.aiKnowledgeChunks).values({
      id: chunkId, generationId: generation!.id, pageId, revisionId,
      chunkIndex: 0, contentText: 'secret content', contentHash: 'chunk-secret',
      byteCount: 14, embedding: [1, 0, 0],
    });

    // Actor whose api_key scopes do not include 'view' cannot read any page,
    // so retrieve() must filter this chunk's page out entirely (FR-009).
    const results = await retrieve(buildApiKeyCtx(userId, 'reader', ['ai.read'], 'key'), generation!.id, [1, 0, 0], 10);

    expect(results).toHaveLength(0);
    expect(JSON.stringify(results)).not.toContain('secret content');

    await clearAiData();
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.id, revisionId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(userId);
  });
});
