import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * Resolve an image asset's content type from the database. External backends
 * (Local/S3) store only the raw bytes; the mime type always lives in
 * `content_assets` (contract: "content type from DB").
 */
export async function getStoredContentType(assetId: string): Promise<string | null> {
  const [row] = await db
    .select({ contentType: schema.contentAssets.contentType })
    .from(schema.contentAssets)
    .where(eq(schema.contentAssets.id, assetId))
    .limit(1);
  return row?.contentType ?? null;
}
