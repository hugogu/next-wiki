# Contract: ContentStore Interface & Backend Behavior

**Feature**: 003-content-storage-backends
**Date**: 2026-06-19

The `ContentStore` is the single server-side abstraction over raw content bytes.
It is the testable contract every backend implementation must satisfy
(constitution P9: explicit bounded registry, typed contract).

```ts
export type StorageBackendType = 'database' | 'local' | 's3';

export interface ContentStore {
  readonly type: StorageBackendType;

  // Markdown is addressed by revisionId; fingerprint lives in DB (content_hash).
  putMarkdown(revisionId: string, source: string): Promise<void>;
  getMarkdown(revisionId: string): Promise<string>;

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
```

## Behavioral contract (all implementations)

1. **Content-addressed integrity**: a successful `get*` returns exactly the bytes
   a prior `put*` wrote; the caller verifies against the DB fingerprint during
   migration. Writes are atomic per key (no partial object visible).
2. **Idempotent writes**: re-`put`ting the same key with the same bytes is a no-op
   from the reader's perspective (enables safe migration retry — FR-022).
3. **Errors are explicit**: unreachable backend / missing key throw typed errors;
   never return empty/partial silently (FR-012). Save paths surface them as
   atomic failures; the image read route maps "missing bytes" to a placeholder
   (Edge Cases).
4. **No permission logic inside the store**: permission checks happen in services/
   routes via `can()`; the store only moves bytes.

## Backend specifics

### DatabaseStore (`type: 'database'`, default)

- Markdown: read/write `page_revisions.content_source` by `revisionId`.
- Images: read/write `content_blobs(asset_id, bytes)`.
- `listMarkdownKeys` = all revision ids; `listImageKeys` = all non-deleted
  `content_assets` ids.
- `healthCheck`: trivially ok (the DB is already required).

### LocalStore (`type: 'local'`)

- Base dir from `config.basePath` (must be writable; Docker volume mount).
- Markdown at `{basePath}/markdown/{revisionId}.md`; images at
  `{basePath}/assets/{assetId}` (no extension needed; content type from DB).
- Writes use write-to-temp-then-rename for atomicity.
- `healthCheck`: base dir exists and is writable (probe file).

### S3Store (`type: 's3'`)

- `@aws-sdk/client-s3`; bucket/prefix/region/endpoint from `config`; credentials
  from `config.accessKeyId` + decrypted `secret`.
- Markdown at `{prefix}/markdown/{revisionId}.md`; images at
  `{prefix}/assets/{assetId}`.
- `healthCheck`: `HeadBucket` (or a small put/delete probe).
- Endpoint override supports S3-compatible stores (MinIO) — P8 vendor-neutral.

## Git export (NOT a ContentStore)

Git is write-only and lives outside this interface (`src/server/git/export.ts`,
driven by the `git-export` pg-boss job). It receives a page's path, Markdown
(with frontmatter), and referenced image bytes, and commits/pushes them. It is
never read back; it never participates in migration enumeration or verification.

## Registry (`src/server/content-store/registry.ts`)

```ts
getActiveStore(): Promise<ContentStore>   // reads the active primary backend row
getStoreFor(backend: StorageBackendRow): ContentStore  // for migration source/target
```

Implementations are imported and constructed explicitly here — no filesystem or
dynamic discovery (P9).

## Test contract

A shared conformance test suite (Vitest) runs the same scenarios against every
implementation: round-trip markdown, round-trip image, overwrite idempotency,
missing-key error, enumeration completeness, health check. DatabaseStore and
LocalStore run in CI unconditionally; S3Store runs against a MinIO container in
the integration profile.
