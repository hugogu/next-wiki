import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { DatabaseStore } from '@/server/content-store/database-store';
import { writeAsset } from '@/server/content-store/atomic-write';
import { validateAttachment } from '@/server/content-store/attachment-validation';
import { assertNotMigrating } from '@/server/services/migration';
import { getAttachmentSettings } from './attachment-settings';

export type AttachedFile = {
  id: string;
  pageId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: string | null;
};

type PageForAttachment = {
  id: string;
  authorId: string;
  currentPublishedVersionId: string | null;
  spaceKind: 'wiki' | 'raw' | 'generated';
  anonymousRead: boolean;
  visibility: 'public' | 'registered' | 'restricted';
};

async function loadPageForAttachment(pageId: string): Promise<PageForAttachment | null> {
  const rows = await db
    .select({
      id: schema.pages.id,
      authorId: schema.pages.authorId,
      currentPublishedVersionId: schema.pages.currentPublishedVersionId,
      spaceKind: schema.spaces.kind,
      anonymousRead: schema.spaces.anonymousRead,
      visibility: schema.pages.visibility,
    })
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
    .where(and(eq(schema.pages.id, pageId), isNull(schema.pages.deletedAt)));
  return rows[0] ?? null;
}

function permOptions(ctx: PermCtx, page: PageForAttachment) {
  return {
    anonymousRead: page.anonymousRead,
    spaceKind: page.spaceKind,
    visibility: page.visibility,
    isAuthor: getActorUserId(ctx) === page.authorId,
  };
}

/** Whether the caller can currently read this page — checked, for the
 * published state or the draft state as applicable, using the same
 * derivation `canReadAttachment` (US2) will reuse for listing/downloading. */
export function canReadPage(ctx: PermCtx, page: PageForAttachment): boolean {
  const opts = permOptions(ctx, page);
  if (page.currentPublishedVersionId && can(ctx, 'read', { kind: 'page', pageId: page.id }, opts)) {
    return true;
  }
  return can(ctx, 'read_draft', { kind: 'page', pageId: page.id }, opts);
}

/**
 * Whether the caller may attach a file to this page. Session users need
 * only the existing `attach_file` (edit-equivalent) permission on the page.
 * API key/MCP credentials additionally need read access to this specific
 * page (FR-007a) — the dedicated `attachments` scope alone is not enough to
 * blindly write to a page the credential cannot even see.
 */
export function canAttach(ctx: PermCtx, page: PageForAttachment): boolean {
  if (!can(ctx, 'attach_file', { kind: 'page', pageId: page.id }, permOptions(ctx, page))) {
    return false;
  }
  if (ctx.actor.kind === 'api_key') {
    return canReadPage(ctx, page);
  }
  return true;
}

const MAX_FILE_NAME_LENGTH = 255;
/** Deliberately matches control characters for filename safety (FR-011b). */
const UNSAFE_FILE_NAME_CHARS = /[\x00-\x1f\x7f/\\]/;

/**
 * A supplied file name is validated as a single non-empty display name
 * (FR-011b): no control characters, no path separators (so it can never be
 * interpreted as a storage path), and not a bare "." or ".." (path
 * traversal token). Safe encoding for rendering/`Content-Disposition` is a
 * separate, presentation-side concern (see the content route in US2).
 */
export function validateFileName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_FILE_NAME_LENGTH) {
    throw new DomainError(
      'BAD_REQUEST',
      'Attachment file name must be a non-empty name of at most 255 characters',
    );
  }
  if (UNSAFE_FILE_NAME_CHARS.test(trimmed)) {
    throw new DomainError(
      'BAD_REQUEST',
      'Attachment file name may not contain control characters or path separators',
    );
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new DomainError('BAD_REQUEST', 'Attachment file name may not be "." or ".."');
  }
  return trimmed;
}

function toAttachedFile(
  row: typeof schema.pageAttachments.$inferSelect,
  contentType: string,
  sizeBytes: number,
): AttachedFile {
  return {
    id: row.id,
    pageId: row.pageId,
    fileName: row.fileName,
    contentType,
    sizeBytes,
    createdAt: row.createdAt,
    uploadedBy: row.uploadedBy,
  };
}

/**
 * Attach a file to a page: validate permission, file name, and content
 * (size/type against the current admin configuration), persist the bytes
 * through the same storage foundation embedded images use (kind =
 * 'attachment'), and link it to the page via a new `page_attachments` row.
 * Rejects the whole upload — never truncates or partially stores — when it
 * exceeds the configured size (FR-011a).
 */
export async function attachFile(
  ctx: PermCtx,
  pageId: string,
  bytes: Buffer,
  fileName: string,
): Promise<AttachedFile> {
  const userId = getActorUserId(ctx);
  if (userId === null) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to attach files');
  }

  const page = await loadPageForAttachment(pageId);
  if (!page) {
    throw new DomainError('NOT_FOUND', 'Page not found');
  }
  if (!canAttach(ctx, page)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to attach files to this page');
  }
  await assertNotMigrating();

  const safeName = validateFileName(fileName);

  const settings = await getAttachmentSettings();
  const result = validateAttachment(bytes, settings.maxSizeBytes, settings.allowedCategories);
  if (!result.ok) {
    if (result.reason === 'too_large') {
      throw new DomainError(
        'ATTACHMENT_TOO_LARGE',
        `Attachment exceeds the maximum allowed size of ${settings.maxSizeBytes} bytes`,
      );
    }
    throw new DomainError('UNSUPPORTED_ATTACHMENT_TYPE', 'Unsupported or disallowed attachment type');
  }

  const { id: assetId } = await writeAsset(new DatabaseStore(), {
    kind: 'attachment',
    bytes: result.bytes,
    contentType: result.contentType,
    contentHash: result.contentHash,
    sizeBytes: result.sizeBytes,
    createdBy: userId,
  });

  const [row] = await db
    .insert(schema.pageAttachments)
    .values({ pageId: page.id, assetId, fileName: safeName, uploadedBy: userId })
    .returning();

  return toAttachedFile(row!, result.contentType, result.sizeBytes);
}

/**
 * List a page's currently-attached files (soft-removed rows excluded), for
 * any caller who can read the page — no independent permission beyond that
 * existing read access (FR-003a/FR-003b). A missing or unreadable page is
 * reported identically (NOT_FOUND) so the response never leaks whether a
 * protected page exists (FR-003c).
 */
export async function listAttachments(ctx: PermCtx, pageId: string): Promise<AttachedFile[]> {
  const page = await loadPageForAttachment(pageId);
  if (!page || !canReadPage(ctx, page)) {
    throw new DomainError('NOT_FOUND', 'Page not found');
  }

  const rows = await db
    .select({
      attachment: schema.pageAttachments,
      contentType: schema.contentAssets.contentType,
      sizeBytes: schema.contentAssets.sizeBytes,
    })
    .from(schema.pageAttachments)
    .innerJoin(schema.contentAssets, eq(schema.pageAttachments.assetId, schema.contentAssets.id))
    .where(
      and(
        eq(schema.pageAttachments.pageId, page.id),
        isNull(schema.pageAttachments.removedAt),
        isNull(schema.contentAssets.deletedAt),
      ),
    )
    .orderBy(desc(schema.pageAttachments.createdAt));

  return rows.map((r) => toAttachedFile(r.attachment, r.contentType, r.sizeBytes));
}
