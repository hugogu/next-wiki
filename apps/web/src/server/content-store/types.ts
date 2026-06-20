/**
 * The single server-side abstraction over raw content bytes (markdown source +
 * image bytes). Every backend implementation satisfies this contract; services
 * and routes never touch backend paths directly (constitution P9).
 *
 * See specs/003-content-storage-backends/contracts/content-store.md.
 */

/** Backends that can act as the authoritative content store (Git is export-only). */
export type StorageBackendType = 'database' | 'local' | 's3';

export interface ContentStore {
  readonly type: StorageBackendType;

  // Markdown is addressed by revisionId; fingerprint lives in DB (content_hash).
  putMarkdown(revisionId: string, source: string): Promise<void>;
  getMarkdown(revisionId: string): Promise<string>;
  deleteMarkdown(revisionId: string): Promise<void>;

  // Images are addressed by assetId (UUID); fingerprint in content_assets.content_hash.
  putImage(assetId: string, bytes: Buffer, contentType: string): Promise<void>;
  getImage(assetId: string): Promise<{ bytes: Buffer; contentType: string }>;
  deleteImage(assetId: string): Promise<void>;

  // Enumeration for migration (no full-corpus load into memory).
  listMarkdownKeys(): AsyncIterable<string>;
  listImageKeys(): AsyncIterable<string>;

  // Pre-activation validation (FR-015).
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

// ---- Typed backend errors --------------------------------------------------

/** Base class for all ContentStore failures; carries the backend type for logs. */
export class ContentStoreError extends Error {
  constructor(
    public readonly backendType: StorageBackendType,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ContentStoreError';
  }
}

/** A requested key (revision markdown or image bytes) does not exist. */
export class ContentNotFoundError extends ContentStoreError {
  constructor(backendType: StorageBackendType, key: string) {
    super(backendType, `Content not found: ${key}`);
    this.name = 'ContentNotFoundError';
  }
}

/** The backend is unreachable / misconfigured; bytes could not be moved. */
export class BackendUnavailableError extends ContentStoreError {
  constructor(backendType: StorageBackendType, detail: string, cause?: unknown) {
    super(backendType, `Storage backend unavailable: ${detail}`, cause);
    this.name = 'BackendUnavailableError';
  }
}

// ---- Key helpers & namespace rules -----------------------------------------
//
// External backends (Local/S3) lay content out under a managed namespace:
//   {basePath|prefix}/markdown/{revisionId}.md
//   {basePath|prefix}/assets/{assetId}
// Keys are derived only from server-generated UUIDs, never user input, but we
// still defensively reject anything that could escape the namespace.

export const MARKDOWN_PREFIX = 'markdown';
export const ASSETS_PREFIX = 'assets';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Reject ids that could traverse outside the managed namespace. */
export function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Unsafe content key segment: ${JSON.stringify(id)}`);
  }
}

export function markdownKey(revisionId: string): string {
  assertSafeId(revisionId);
  return `${MARKDOWN_PREFIX}/${revisionId}.md`;
}

export function imageKey(assetId: string): string {
  assertSafeId(assetId);
  return `${ASSETS_PREFIX}/${assetId}`;
}
