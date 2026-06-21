import { eq, isNull, and } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DatabaseStore } from '@/server/content-store/database-store';
import { writeImageAsset } from '@/server/content-store/atomic-write';
import { validateImage } from '@/server/content-store/image-validation';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';

export async function writeImportedAsset(input: {
  bytes: Buffer;
  contentType: string;
  actorUserId: string | null;
}): Promise<{ id: string; contentHash: string }> {
  const validation = validateImage(input.bytes, env.CONTENT_ASSET_MAX_BYTES);
  if (!validation.ok || validation.contentType !== input.contentType) {
    throw new DomainError('INVALID_ARCHIVE', 'Imported image bytes or media type are invalid');
  }
  const existing = await db.query.contentAssets.findFirst({
    where: and(
      eq(schema.contentAssets.contentHash, validation.contentHash),
      isNull(schema.contentAssets.deletedAt),
    ),
  });
  if (existing) return { id: existing.id, contentHash: existing.contentHash };
  const created = await writeImageAsset(new DatabaseStore(), {
    bytes: input.bytes,
    contentType: validation.contentType,
    contentHash: validation.contentHash,
    sizeBytes: validation.sizeBytes,
    createdBy: input.actorUserId,
  });
  return { id: created.id, contentHash: validation.contentHash };
}
