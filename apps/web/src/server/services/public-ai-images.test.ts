import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { cancelPublicImageGeneration, getPublicImageGeneration } from './public-ai-images';

describe('public image generation facade', () => {
  it('requires an owning Editor/Admin API key carrying ai.image and hides other owners', async () => {
    await clearAiData();
    const ownerId = await createAiTestUser('editor');
    const otherId = await createAiTestUser('editor');
    try {
      const [action] = await db.insert(schema.aiActions).values({
        feature: 'image_generation',
        actorUserId: ownerId,
        expiresAt: new Date(Date.now() + 60_000),
      }).returning();

      await expect(getPublicImageGeneration(buildUserCtx(ownerId, 'editor'), action!.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(getPublicImageGeneration(buildApiKeyCtx(ownerId, 'editor', ['edit'], 'key-no-image'), action!.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(getPublicImageGeneration(buildApiKeyCtx(otherId, 'editor', ['ai.image'], 'other-key'), action!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(getPublicImageGeneration(buildApiKeyCtx(ownerId, 'editor', ['ai.image'], 'image-key'), action!.id)).resolves.toMatchObject({
        id: action!.id,
        status: 'queued',
      });
    } finally {
      await clearAiData();
      await removeAiTestUser(ownerId);
      await removeAiTestUser(otherId);
    }
  });

  it('makes cancellation idempotent while recording a queued cancellation request', async () => {
    await clearAiData();
    const ownerId = await createAiTestUser('editor');
    try {
      const [action] = await db.insert(schema.aiActions).values({
        feature: 'image_generation',
        actorUserId: ownerId,
        expiresAt: new Date(Date.now() + 60_000),
      }).returning();
      const ctx = buildApiKeyCtx(ownerId, 'editor', ['ai.image'], 'image-key');

      await cancelPublicImageGeneration(ctx, action!.id);
      await cancelPublicImageGeneration(ctx, action!.id);

      const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action!.id) });
      expect(row?.cancelRequested).toBe(true);
    } finally {
      await clearAiData();
      await removeAiTestUser(ownerId);
    }
  });
});
