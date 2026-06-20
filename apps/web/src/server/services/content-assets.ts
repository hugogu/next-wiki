import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { env } from '@/server/config';
import { getActiveStore } from '@/server/content-store/registry';
import { writeImageAsset, isUploadExpired } from '@/server/content-store/atomic-write';
import { validateImage } from '@/server/content-store/image-validation';
import { extractAssetIds } from '@/server/content-store/asset-references';
import { ContentStoreError } from '@/server/content-store/types';
import type { AssetUploadResult } from '@next-wiki/shared';

// roleAllows('edit') ignores the page id, so a sentinel resource is enough to
// resolve "may this actor author content?" (editor/admin role, edit/create scope).
const SENTINEL_PAGE_ID = '00000000-0000-0000-0000-000000000000';

function canUpload(ctx: PermCtx): boolean {
  return (
    can(ctx, 'create', { kind: 'page_list' }) ||
    can(ctx, 'edit', { kind: 'page', pageId: SENTINEL_PAGE_ID })
  );
}

/** True while a backend migration holds the global write lock (FR-019). */
export async function isMigrationActive(): Promise<boolean> {
  const active = await db.query.contentMigrations.findFirst({
    where: inArray(schema.contentMigrations.status, ['pending', 'copying', 'verifying']),
  });
  return Boolean(active);
}

export async function assertNotMigrating(): Promise<void> {
  if (await isMigrationActive()) {
    throw new DomainError('STORAGE_MIGRATING', 'Content storage is migrating; writes are paused');
  }
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
        : 'Unsupported image type; allowed types are PNG, JPEG, GIF, and WebP';
    throw new DomainError('INVALID_IMAGE', message);
  }

  const store = await getActiveStore();
  let id: string;
  try {
    ({ id } = await writeImageAsset(store, {
      bytes,
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
    const store = await getActiveStore();
    const { bytes, contentType } = await store.getImage(assetId);
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
