import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readImageFromDatabase, readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { extractLocalAssetIds } from '@/server/transfers/markdown-links';

export type ExportAsset = {
  id: string;
  contentHash: string;
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
};

export type ExportPage = {
  id: string;
  revisionId: string;
  path: string;
  locale: string;
  title: string;
  markdown: string;
  contentHash: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assetIds: string[];
};

export async function capturePublishedSnapshot(): Promise<{
  instanceId: string;
  spaceSlug: string;
  capturedAt: string;
  pages: ExportPage[];
  assets: ExportAsset[];
}> {
  const space = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, 'default'),
  });
  if (!space) throw new Error('Default space not found');
  const capturedAt = new Date();
  const rows = await db
    .select({ page: schema.pages, revision: schema.pageRevisions })
    .from(schema.pages)
    .innerJoin(
      schema.pageRevisions,
      eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id),
    )
    .where(and(eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)))
    .orderBy(schema.pages.locale, schema.pages.path);

  // A full-instance export reconciles the whole published snapshot, so read markdown
  // and images straight from the database (always in sync, see pages.ts create/newDraft)
  // instead of the S3-preferred replica, and resolve rows concurrently.
  const assetIds = new Set<string>();
  const pages: ExportPage[] = await Promise.all(
    rows.map(async (row) => {
      const markdown = await readMarkdownFromDatabase(row.revision);
      const referenced = extractLocalAssetIds(markdown);
      referenced.forEach((id) => assetIds.add(id));
      return {
        id: row.page.id,
        revisionId: row.revision.id,
        path: row.page.path,
        locale: row.page.locale,
        title: row.page.title,
        markdown,
        contentHash: row.revision.contentHash,
        publishedAt: row.revision.publishedAt?.toISOString() ?? null,
        createdAt: row.page.createdAt.toISOString(),
        updatedAt: row.page.updatedAt.toISOString(),
        assetIds: referenced,
      };
    }),
  );

  const assetRows = await Promise.all(
    [...assetIds].sort().map((id) =>
      db.query.contentAssets.findFirst({
        where: and(eq(schema.contentAssets.id, id), isNull(schema.contentAssets.deletedAt)),
      }),
    ),
  );
  const assets = (
    await Promise.all(
      assetRows.map(async (asset): Promise<ExportAsset | null> => {
        if (!asset) return null;
        const image = await readImageFromDatabase(asset);
        return {
          id: asset.id,
          contentHash: asset.contentHash,
          contentType: image.contentType,
          sizeBytes: image.bytes.length,
          bytes: image.bytes,
        };
      }),
    )
  ).filter((asset): asset is ExportAsset => asset !== null);
  return {
    instanceId: space.id,
    spaceSlug: space.slug,
    capturedAt: capturedAt.toISOString(),
    pages,
    assets,
  };
}
