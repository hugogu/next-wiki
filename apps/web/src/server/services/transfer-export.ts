import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readImageFromDatabase, readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { extractLocalAssetIds } from '@/server/transfers/markdown-links';
import { resolveSpace } from '@/server/services/spaces';
import type { SpaceRow } from '@/server/services/spaces';

export type ExportAsset = {
  id: string;
  contentHash: string;
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
};

/** Per-page space kind label, written into the portable v2 manifest so the
 * importer can dispatch by destination space. */
export type ExportSpaceKind = 'wiki' | 'generated' | 'raw';

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
  /** Destination space metadata carried into the portable v2 manifest. */
  spaceKind: ExportSpaceKind;
  spaceSlug: string;
  /** Body content type: 'text/markdown' for wiki/generated, the raw entry's
   * declared contentType for raw entries (e.g. 'text/plain', 'application/json'). */
  markdownContentType: string;
  /** Raw provenance — null for wiki/generated pages. */
  inputKind?: 'chat-transcript' | 'external-fetch' | 'script-run' | 'manual-note' | null;
  rawSource?: Record<string, unknown> | null;
};

export type ExportSnapshot = {
  instanceId: string;
  capturedAt: string;
  pages: ExportPage[];
  assets: ExportAsset[];
};

async function readAssetBytes(assetId: string): Promise<ExportAsset | null> {
  const asset = await db.query.contentAssets.findFirst({
    where: and(eq(schema.contentAssets.id, assetId), isNull(schema.contentAssets.deletedAt)),
  });
  if (!asset) return null;
  const image = await readImageFromDatabase(asset);
  return {
    id: asset.id,
    contentHash: asset.contentHash,
    contentType: image.contentType,
    sizeBytes: image.bytes.length,
    bytes: image.bytes,
  };
}

async function captureSnapshot(args: {
  space: SpaceRow;
  kind: ExportSpaceKind;
  revisionColumn: typeof schema.pages.currentPublishedVersionId | typeof schema.pages.latestVersionId;
  extraAssetIds?: Set<string>;
}): Promise<{ pages: ExportPage[]; assets: ExportAsset[] }> {
  const { space, kind, revisionColumn } = args;
  const referencedAssetIds = args.extraAssetIds ?? new Set<string>();
  const rows = await db
    .select({ page: schema.pages, revision: schema.pageRevisions })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(revisionColumn, schema.pageRevisions.id))
    .where(and(eq(schema.pages.spaceId, space.id), isNull(schema.pages.deletedAt)))
    .orderBy(schema.pages.locale, schema.pages.path);

  const pages: ExportPage[] = await Promise.all(
    rows.map(async (row) => {
      const markdown = await readMarkdownFromDatabase(row.revision);
      const referenced = extractLocalAssetIds(markdown);
      referenced.forEach((id) => referencedAssetIds.add(id));
      // Raw entries reference their original-bytes asset via originalAssetId;
      // carry those bytes alongside the body so the importer can re-materialize them.
      if (kind === 'raw' && row.revision.originalAssetId) {
        referencedAssetIds.add(row.revision.originalAssetId);
      }
      const sourceMetadata = row.revision.sourceMetadata as
        | { inputKind?: string; channel?: string; url?: string; sessionId?: string; command?: string; occurredAt?: string }
        | null;
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
        spaceKind: kind,
        spaceSlug: space.slug,
        markdownContentType: row.revision.contentType ?? 'text/markdown',
        inputKind:
          kind === 'raw' && sourceMetadata?.inputKind
            ? (sourceMetadata.inputKind as ExportPage['inputKind'])
            : null,
        rawSource:
          kind === 'raw' && sourceMetadata
            ? (Object.fromEntries(
                Object.entries(sourceMetadata).filter(([key]) => key !== 'inputKind'),
              ) as Record<string, unknown>)
            : null,
      };
    }),
  );

  const assetRows = await Promise.all(
    [...referencedAssetIds].sort().map((id) => readAssetBytes(id)),
  );
  const assets = assetRows.filter((asset): asset is ExportAsset => asset !== null);
  return { pages, assets };
}

async function resolveSpaceByKind(kind: 'raw' | 'generated'): Promise<SpaceRow | null> {
  const space = await resolveSpace(kind);
  return space && space.kind === kind ? space : null;
}

/** Capture published pages from the default wiki space (back-compat entry point). */
export async function capturePublishedSnapshot(): Promise<ExportSnapshot> {
  const space = await resolveSpace();
  if (!space) throw new Error('Default space not found');
  const capturedAt = new Date();
  const { pages, assets } = await captureSnapshot({
    space,
    kind: 'wiki',
    revisionColumn: schema.pages.currentPublishedVersionId,
  });
  return {
    instanceId: space.id,
    capturedAt: capturedAt.toISOString(),
    pages,
    assets,
  };
}

/** Generated exports intentionally capture drafts, so each concept's latest source is portable. */
export async function captureGeneratedSnapshot(): Promise<ExportSnapshot> {
  const space = await resolveSpaceByKind('generated');
  if (!space) throw new Error('Generated space not found');
  const capturedAt = new Date();
  const { pages, assets } = await captureSnapshot({
    space,
    kind: 'generated',
    revisionColumn: schema.pages.latestVersionId,
  });
  return {
    instanceId: space.id,
    capturedAt: capturedAt.toISOString(),
    pages,
    assets,
  };
}

/** Capture raw entries (latest published revision per page) with their
 * sourceMetadata, declared contentType, and any original-byte assets. Returns
 * null when the deployment has no raw space (e.g. Copilot mode). */
export async function captureRawSnapshot(): Promise<ExportSnapshot | null> {
  const space = await resolveSpaceByKind('raw');
  if (!space) return null;
  const capturedAt = new Date();
  const { pages, assets } = await captureSnapshot({
    space,
    kind: 'raw',
    revisionColumn: schema.pages.currentPublishedVersionId,
  });
  return {
    instanceId: space.id,
    capturedAt: capturedAt.toISOString(),
    pages,
    assets,
  };
}

/** Full site export: union of wiki + raw + generated, deduplicated assets.
 * Wiki pages use currentPublishedVersionId; generated captures latest drafts;
 * raw captures currentPublishedVersionId (auto-publish on append). */
export async function captureFullSnapshot(): Promise<ExportSnapshot> {
  const capturedAt = new Date();
  const wikiSpace = await resolveSpace();
  const rawSpace = await resolveSpaceByKind('raw');
  const generatedSpace = await resolveSpaceByKind('generated');

  const sharedAssets = new Set<string>();
  const segments: Promise<{ pages: ExportPage[]; assets: ExportAsset[] }>[] = [];
  if (wikiSpace) {
    segments.push(
      captureSnapshot({
        space: wikiSpace,
        kind: 'wiki',
        revisionColumn: schema.pages.currentPublishedVersionId,
        extraAssetIds: sharedAssets,
      }),
    );
  }
  if (generatedSpace) {
    segments.push(
      captureSnapshot({
        space: generatedSpace,
        kind: 'generated',
        revisionColumn: schema.pages.latestVersionId,
        extraAssetIds: sharedAssets,
      }),
    );
  }
  if (rawSpace) {
    segments.push(
      captureSnapshot({
        space: rawSpace,
        kind: 'raw',
        revisionColumn: schema.pages.currentPublishedVersionId,
        extraAssetIds: sharedAssets,
      }),
    );
  }
  const results = await Promise.all(segments);
  const pages = results.flatMap((r) => r.pages);
  const assetsByName = new Map<string, ExportAsset>();
  for (const r of results) for (const a of r.assets) assetsByName.set(a.id, a);
  // Also include any referenced asset ids that weren't hydrated yet (edge case
  // where the row was missing in DB — silently dropped, matching prior behaviour).
  const assets = [...assetsByName.values()].sort((a, b) => a.id.localeCompare(b.id));
  const instanceId = wikiSpace?.id ?? rawSpace?.id ?? generatedSpace?.id ?? 'next-wiki';
  return {
    instanceId,
    capturedAt: capturedAt.toISOString(),
    pages,
    assets,
  };
}
