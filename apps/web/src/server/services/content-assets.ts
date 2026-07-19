import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { env } from '@/server/config';
import { DatabaseStore } from '@/server/content-store/database-store';
import { writeImageAsset, isUploadExpired } from '@/server/content-store/atomic-write';
import { validateImage } from '@/server/content-store/image-validation';
import { extractAssetIds } from '@/server/content-store/asset-references';
import { ContentStoreError } from '@/server/content-store/types';
import { assertNotMigrating } from '@/server/services/migration';
import type { AssetUploadResult } from '@next-wiki/shared';
import { readImageWithFallback } from '@/server/content-store/read-router';
import { getPreferredReadBackend, getStoreFor } from '@/server/content-store/registry';
import { S3Store } from '@/server/content-store/s3-store';

// roleAllows('edit') ignores the page id, so a sentinel resource is enough to
// resolve "may this actor author content?" (editor/admin role, edit/create scope).
const SENTINEL_PAGE_ID = '00000000-0000-0000-0000-000000000000';

function canUpload(ctx: PermCtx): boolean {
  return (
    can(ctx, 'create', { kind: 'page_list' }) ||
    can(ctx, 'edit', { kind: 'page', pageId: SENTINEL_PAGE_ID })
  );
}

export type UploadResult = AssetUploadResult;

/** Upload an image: validate, persist bytes + metadata, return its asset URL. */
export async function uploadImage(ctx: PermCtx, bytes: Buffer): Promise<UploadResult> {
  if (getActorUserId(ctx) === null) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to upload images');
  }
  if (!canUpload(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to upload images');
  }
  await assertNotMigrating();

  const result = validateImage(bytes, env.CONTENT_ASSET_MAX_BYTES);
  if (!result.ok) {
    const message =
      result.reason === 'too_large'
        ? 'Image exceeds the maximum allowed size'
        : 'Unsupported image type; allowed types are PNG, JPEG, GIF, WebP, and SVG';
    throw new DomainError('INVALID_IMAGE', message);
  }

  let id: string;
  try {
    ({ id } = await writeImageAsset(new DatabaseStore(), {
      // result.bytes is the canonical (for SVG, sanitized) form that matches
      // the returned hash and size — never persist the raw input.
      bytes: result.bytes,
      contentType: result.contentType,
      contentHash: result.contentHash,
      sizeBytes: result.sizeBytes,
      createdBy: getActorUserId(ctx),
    }));
  } catch (error) {
    if (error instanceof ContentStoreError) {
      throw new DomainError('STORAGE_UNAVAILABLE', 'Failed to store image; please retry');
    }
    throw error;
  }

  return {
    id,
    url: `/api/assets/${id}`,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
  };
}

export type ServableImage =
  | { kind: 'ok'; bytes: Buffer; contentType: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

/**
 * Resolve an image for serving, enforcing page-equivalent read permission. A
 * caller may read the asset if they can read at least one live page that
 * references it, or — for a freshly uploaded, still-unreferenced asset — if they
 * are the uploader and the abandoned-upload TTL has not elapsed. Unreadable or
 * missing assets are reported as `not_found` (no existence leak).
 */
export async function getServableImage(ctx: PermCtx, assetId: string): Promise<ServableImage> {
  const asset = await db.query.contentAssets.findFirst({
    where: and(eq(schema.contentAssets.id, assetId), isNull(schema.contentAssets.deletedAt)),
  });
  if (!asset) return { kind: 'not_found' };

  if (!(await canReadAsset(ctx, asset))) return { kind: 'not_found' };

  try {
    const preferred = await getPreferredReadBackend();
    // SVG must always be served by this app so the strict sandbox CSP applies.
    // A presigned S3 URL would be fetched directly by the browser, bypassing
    // our security headers, so SVG is never redirected even on an S3 backend.
    if (preferred?.type === 's3' && asset.contentType !== 'image/svg+xml') {
      const replicated = await db.query.storageReplicationTasks.findFirst({
        where: and(
          eq(schema.storageReplicationTasks.backendId, preferred.id),
          eq(schema.storageReplicationTasks.objectKind, 'image'),
          eq(schema.storageReplicationTasks.objectId, asset.id),
          eq(schema.storageReplicationTasks.operation, 'upsert'),
          eq(schema.storageReplicationTasks.status, 'completed'),
          eq(schema.storageReplicationTasks.expectedHash, asset.contentHash),
        ),
      });
      const store = getStoreFor(preferred);
      if (replicated && store instanceof S3Store) {
        // Presign for longer than the route's redirect cache window so the
        // browser can reuse the cached redirect (and thus the same S3 URL).
        return { kind: 'redirect', url: await store.presignImage(asset.id, 300) };
      }
    }
    const { bytes, contentType } = await readImageWithFallback(asset);
    return { kind: 'ok', bytes, contentType };
  } catch (error) {
    if (error instanceof ContentStoreError) return { kind: 'unavailable' };
    throw error;
  }
}

async function canReadAsset(
  ctx: PermCtx,
  asset: typeof schema.contentAssets.$inferSelect,
): Promise<boolean> {
  // Live referencing pages: a published reference is readable per the page's
  // read rule; a draft reference is readable per read_draft.
  const rows = await db
    .select({
      pageId: schema.pages.id,
      authorId: schema.pages.authorId,
      currentPublishedVersionId: schema.pages.currentPublishedVersionId,
      revisionId: schema.pageRevisions.id,
      version: schema.pageRevisions.versionNumber,
      anonymousRead: schema.spaces.anonymousRead,
    })
    .from(schema.contentAssetRefs)
    .innerJoin(schema.pageRevisions, eq(schema.contentAssetRefs.revisionId, schema.pageRevisions.id))
    .innerJoin(schema.pages, eq(schema.pageRevisions.pageId, schema.pages.id))
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
    .where(and(eq(schema.contentAssetRefs.assetId, asset.id), isNull(schema.pages.deletedAt)));

  const userId = getActorUserId(ctx);

  for (const row of rows) {
    const isAuthor = userId ? row.authorId === userId : false;
    const isPublishedRef = row.currentPublishedVersionId === row.revisionId;
    if (isPublishedRef) {
      if (can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: row.anonymousRead })) {
        return true;
      }
    } else if (
      can(ctx, 'read_draft', { kind: 'revision', pageId: row.pageId, version: row.version }, { isAuthor })
    ) {
      return true;
    }
  }

  // Uploader's temporary access to an as-yet-unreferenced upload.
  if (
    rows.length === 0 &&
    userId !== null &&
    asset.createdBy === userId &&
    !isUploadExpired(asset.createdAt, env.CONTENT_UPLOAD_TTL_HOURS)
  ) {
    return true;
  }

  return false;
}

export type ServableRawAsset =
  | { kind: 'ok'; bytes: Buffer; contentType: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

/**
 * Whether the caller may read a raw original-bytes asset — decided by the raw
 * page(s) that reference it via `page_revisions.original_asset_id`. Raw pages are
 * Admin-only, so this is effectively an Admin gate, but it is expressed through
 * the same `can()` read rule as the page for consistency.
 */
async function canReadRawAsset(ctx: PermCtx, asset: typeof schema.contentAssets.$inferSelect): Promise<boolean> {
  const rows = await db
    .select({
      pageId: schema.pages.id,
      anonymousRead: schema.spaces.anonymousRead,
      spaceKind: schema.spaces.kind,
      visibility: schema.pages.visibility,
    })
    .from(schema.pageRevisions)
    .innerJoin(schema.pages, eq(schema.pageRevisions.pageId, schema.pages.id))
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
    .where(and(eq(schema.pageRevisions.originalAssetId, asset.id), isNull(schema.pages.deletedAt)));

  for (const row of rows) {
    if (can(ctx, 'read', { kind: 'page', pageId: row.pageId }, { spaceKind: row.spaceKind, anonymousRead: row.anonymousRead, visibility: row.visibility })) {
      return true;
    }
  }

  const userId = getActorUserId(ctx);
  if (rows.length === 0 && userId !== null && asset.createdBy === userId && !isUploadExpired(asset.createdAt, env.CONTENT_UPLOAD_TTL_HOURS)) {
    return true;
  }
  return false;
}

/**
 * Resolve a raw entry's immutable original bytes for serving/download. Reuses the
 * shared content-store read path (Database or external backend), always serving
 * through this app so the content type and download disposition are controlled;
 * raw assets are Admin-only and low-traffic, so no S3 redirect is used.
 */
export async function getServableRawAsset(ctx: PermCtx, assetId: string): Promise<ServableRawAsset> {
  const asset = await db.query.contentAssets.findFirst({
    where: and(eq(schema.contentAssets.id, assetId), isNull(schema.contentAssets.deletedAt)),
  });
  if (!asset) return { kind: 'not_found' };
  if (!(await canReadRawAsset(ctx, asset))) return { kind: 'not_found' };
  try {
    const { bytes } = await readImageWithFallback(asset);
    return { kind: 'ok', bytes, contentType: asset.contentType };
  } catch (error) {
    if (error instanceof ContentStoreError) return { kind: 'unavailable' };
    throw error;
  }
}

/**
 * Synchronize `content_asset_refs` for a revision to exactly the assets its
 * Markdown references. Runs in the same transaction as the revision write so
 * reference tracking is atomic with the revision metadata (plan D2, T030).
 */
export async function syncRevisionAssetRefs(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  revisionId: string,
  markdown: string,
): Promise<void> {
  const referenced = extractAssetIds(markdown);

  await tx.delete(schema.contentAssetRefs).where(eq(schema.contentAssetRefs.revisionId, revisionId));
  if (referenced.length === 0) return;

  // Only link assets that actually exist (ignore stale/invalid ids in the text).
  const existing = await tx
    .select({ id: schema.contentAssets.id })
    .from(schema.contentAssets)
    .where(
      and(inArray(schema.contentAssets.id, referenced), isNull(schema.contentAssets.deletedAt)),
    );

  if (existing.length === 0) return;
  await tx
    .insert(schema.contentAssetRefs)
    .values(existing.map((a) => ({ assetId: a.id, revisionId })))
    .onConflictDoNothing();
}
