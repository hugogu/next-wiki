import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import {
  discardGeneratedArtifact,
  getGeneratedArtifact,
  promoteGeneratedArtifact,
} from './ai-artifacts';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2jZsAAAAASUVORK5CYII=',
  'base64',
);

describe('AI generated artifacts', () => {
  let editorId: string;
  let otherId: string;
  let spaceId: string;
  let pageId: string;
  let revisionId: string;
  let actionId: string;
  let artifactId: string;
  beforeEach(async () => {
    await clearAiData();
    editorId = await createAiTestUser('editor');
    otherId = await createAiTestUser('editor');
    spaceId = randomUUID();
    pageId = randomUUID();
    revisionId = randomUUID();
    await db.insert(schema.spaces).values({ id: spaceId, slug: `artifact-${spaceId}`, name: 'Artifact' });
    await db.insert(schema.pages).values({
      id: pageId, spaceId, slug: 'page', path: 'page', title: 'Page', authorId: editorId,
      latestVersionId: revisionId,
    });
    await db.insert(schema.pageRevisions).values({
      id: revisionId, pageId, versionNumber: 1, contentSource: 'body', contentHtml: '<p>body</p>',
      contentHash: 'hash', authorId: editorId,
    });
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    await db.insert(schema.userAiEntitlements).values({
      userId: editorId, imageGenerationEnabled: true, updatedBy: editorId,
    });
    const [action] = await db.insert(schema.aiActions).values({
      feature: 'image_generation', actorUserId: editorId, pageId,
      expiresAt: new Date(Date.now() + 3_600_000),
    }).returning();
    actionId = action!.id;
    const [artifact] = await db.insert(schema.aiGeneratedArtifacts).values({
      actionId, contentType: 'image/png', contentHash: 'image-hash',
      sizeBytes: PNG.byteLength, bytes: PNG, expiresAt: new Date(Date.now() + 3_600_000),
    }).returning();
    artifactId = artifact!.id;
  });
  afterEach(async () => {
    await clearAiData();
    await db.delete(schema.contentBlobs);
    await db.delete(schema.contentAssets);
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, pageId));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    await removeAiTestUser(otherId);
    await removeAiTestUser(editorId);
  });

  it('allows owner preview, hides existence from others, and discards private previews', async () => {
    expect((await getGeneratedArtifact(buildUserCtx(editorId, 'editor'), artifactId)).bytes).toEqual(PNG);
    await expect(getGeneratedArtifact(buildUserCtx(otherId, 'editor'), artifactId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await discardGeneratedArtifact(buildUserCtx(editorId, 'editor'), artifactId);
    await expect(getGeneratedArtifact(buildUserCtx(editorId, 'editor'), artifactId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('promotes idempotently through the existing asset path', async () => {
    const ctx = buildUserCtx(editorId, 'editor');
    const first = await promoteGeneratedArtifact(ctx, artifactId, pageId);
    const second = await promoteGeneratedArtifact(ctx, artifactId, pageId);
    expect(second.id).toBe(first.id);
    expect(first.url).toBe(`/api/assets/${first.id}`);
  });

  it('treats expired previews as not found', async () => {
    await db.update(schema.aiGeneratedArtifacts).set({ expiresAt: new Date(0) }).where(eq(schema.aiGeneratedArtifacts.id, artifactId));
    await expect(getGeneratedArtifact(buildUserCtx(editorId, 'editor'), artifactId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
