# Contracts: Page Attachments

Two contract surfaces, sharing one service layer (constitution "API
Architecture" mandate: "Two layers (REST + OpenAPI public, MCP optional)
sharing one service layer... none bypass permissions"): the public REST API
(`/api/v1/*`, OpenAPI-documented, usable by browser sessions and API keys
alike) and MCP tools (thin wrappers over the same REST endpoints via
`WikiApiClient`). A session-only admin settings endpoint under
`/api/settings/*` follows the existing sibling-settings convention and is
**not** part of the public v1 API (no API key/MCP access — matches how other
admin-only settings such as analytics/search config are scoped today).

All public REST responses use the existing `PublicApiErrorBody` shape
(`{ code, message }`) via `mapPublicDomainError`; no new top-level error
envelope is introduced. Two new internal `DomainError` codes are added and
mapped to **existing** public codes (no `PublicApiErrorCode` enum change
needed):

| New `DomainError` code | Maps to public `code` | HTTP status |
|---|---|---|
| `ATTACHMENT_TOO_LARGE` | `ASSET_TOO_LARGE` (existing) | 413 |
| `UNSUPPORTED_ATTACHMENT_TYPE` | `UNSUPPORTED_ASSET_TYPE` (existing) | 415 |

## REST: Public Content API (`/api/v1/*`)

### `POST /api/v1/pages/{pageId}/attachments`

Attach a file to a page. Implements FR-001, FR-006, FR-007, FR-007a,
FR-011, FR-011a.

- **Auth**: session cookie or bearer API key (`withPublicApi`, same as
  `/api/v1/assets`).
- **Permission**: session user → `can(ctx, 'attach_file', {kind:'page',
  pageId})` (mirrors `edit`). API key → additionally requires the
  `attachments` scope AND `can(ctx, 'read'|'read_draft', {kind:'page',
  pageId}, ...)` on the *same* page (FR-007a).
- **Request**: `multipart/form-data`, field `file` (binary). Original
  filename taken from the multipart part's filename.
- **Response 201** `PublicAttachmentResource`:
  ```jsonc
  {
    "id": "uuid",                 // page_attachments.id
    "pageId": "uuid",
    "fileName": "quarterly-report.pdf",
    "contentType": "application/pdf",
    "sizeBytes": 1048576,
    "url": "/api/v1/attachments/{id}/content",
    "createdAt": "2026-08-06T12:00:00Z",
    "uploadedBy": "uuid | null"
  }
  ```
- **Errors**: `401 UNAUTHORIZED` (no actor) · `403 FORBIDDEN` (fails the
  permission gate above) · `404 NOT_FOUND` (page doesn't exist / not
  visible to actor) · `413 ASSET_TOO_LARGE` (exceeds
  `attachment_settings.max_size_bytes`; whole request rejected, nothing
  persisted — FR-011a) · `415 UNSUPPORTED_ASSET_TYPE` (detected category not
  in `attachment_settings.allowed_categories`) · `422 VALIDATION_FAILED`
  (missing `file` field).

### `GET /api/v1/pages/{pageId}/attachments`

List a page's current attachments. Implements FR-002, FR-003a, FR-003b.

- **Auth**: session cookie or bearer API key, or anonymous (if the page is
  anonymously readable).
- **Permission**: `can(ctx, 'read'|'read_draft', {kind:'page', pageId},
  ...)` — no independent scope for any actor kind (FR-003b).
- **Response 200**: `{ "items": PublicAttachmentResource[] }` (soft-removed
  rows excluded).
- **Errors**: `404 NOT_FOUND` (page not visible to actor — no existence
  leak, matching the existing asset-serving convention of reporting
  unreadable as not-found).

### `GET /api/v1/attachments/{id}/content`

Download one attachment's bytes. Implements FR-002, FR-003, FR-003a,
FR-003b, FR-014.

- **Auth**: session cookie or bearer API key, or anonymous (if the owning
  page is anonymously readable).
- **Permission**: same page-read derivation as the list endpoint, resolved
  via `page_attachments.page_id` → page (FR-003).
- **Response 200**: raw bytes, `Content-Type` = the stored `content_type`,
  `Content-Disposition` = `inline; filename="..."` for the fixed browser-safe
  allowlist (images, `application/pdf`) or `attachment; filename="..."`
  otherwise (FR-014, non-configurable — see research.md §8). No preview
  UI/embed; this is the only content-retrieval path for an attachment
  (FR-013).
- **Errors**: `404 NOT_FOUND` (unreadable, removed, or the underlying blob
  is gone — reader-visible "no longer available" outcome, spec User Story 2
  scenario 3) · `503` (`STORAGE_UNAVAILABLE`-equivalent — backend
  temporarily unreachable, mirrors `ServableImage`'s `unavailable` kind).

### `DELETE /api/v1/attachments/{id}`

Remove an attachment from its page (soft-delete: sets `removed_at`/
`removed_by`). Implements FR-004.

- **Auth**: session cookie or bearer API key.
- **Permission**: `can(ctx, 'edit', {kind:'page', pageId}, ...)` on the
  owning page — the existing edit permission, **no** new `attachments`
  scope required (research.md §5; intentional asymmetry with attach).
- **Response**: `204 No Content`.
- **Errors**: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND`
  (already removed or never existed / not visible).

## REST: Admin Settings (`/api/settings/attachments`, session-only)

Mirrors the existing sibling routes (`/api/settings/{analytics,search,
spaces,site,...}`); **not** exposed under `/api/v1` and not reachable by API
key or MCP.

### `GET /api/settings/attachments`

- **Permission**: `can(ctx, 'manage_storage', {kind:'storage'})` (admin
  only — same gate as `storage-config.ts`'s `isStorageAdmin`).
- **Response 200**: `{ "maxSizeBytes": 104857600, "allowedCategories":
  ["image","video","document"], "updatedAt": "...", "updatedBy": "uuid |
  null" }`.

### `PUT /api/settings/attachments`

Implements FR-008, FR-009, FR-010, FR-012.

- **Permission**: same as GET.
- **Request**: `{ "maxSizeBytes": number (>0), "allowedCategories":
  Array<'image'|'video'|'document'> (non-empty) }`.
- **Response 200**: the updated settings view (same shape as GET).
- **Behavior**: Never touches existing `content_assets`/`page_attachments`
  rows — read only at future upload-validation time (FR-012/SC-005).
- **Errors**: `422 VALIDATION_FAILED` (bad shape) · `403 FORBIDDEN`
  (non-admin).

## MCP Tools

All three call the REST endpoints above through `WikiApiClient`, so
permission enforcement is identical to the REST surface — no MCP-specific
bypass (constitution: "none bypass permissions").

### `attach_file`

- **Input**: `{ pageId: string, fileBase64: string, fileName: string,
  contentType?: string }` (mirrors `upload_image`'s
  base64-in/inferred-type-optional shape).
- **Calls**: `POST /api/v1/pages/{pageId}/attachments`.
- **Output**: the same `PublicAttachmentResource` JSON, stringified.
- **Requires**: the credential's API key must carry the `attachments` scope
  (FR-007) and have read access to `pageId` (FR-007a); otherwise the tool
  surfaces the REST 403 body verbatim so the calling agent sees the missing-
  permission reason (spec User Story 5, scenario 3).

### `list_attachments`

- **Input**: `{ pageId: string }`.
- **Calls**: `GET /api/v1/pages/{pageId}/attachments`.
- **Output**: `{ items: PublicAttachmentResource[] }`, stringified.

### `download_attachment`

- **Input**: `{ attachmentId: string }`.
- **Calls**: `GET /api/v1/attachments/{id}/content`.
- **Output**: `{ fileName, contentType, sizeBytes, bytesBase64 }` — MCP
  tool results are text/JSON, so raw bytes are base64-encoded in the tool
  response (same constraint `upload_image`'s input already works around in
  reverse).

## Shared Zod contracts (`packages/shared/src/content-storage.ts`)

New schemas, additive only (no existing schema changes beyond
`contentAssetKindSchema`):

```ts
export const contentAssetKindSchema = z.enum(['image', 'attachment']); // was image-only

export const attachmentCategorySchema = z.enum(['image', 'video', 'document']);

export const publicAttachmentResourceSchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
  fileName: z.string().min(1),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
  createdAt: z.string(),
  uploadedBy: z.string().uuid().nullable(),
});

export const attachmentSettingsViewSchema = z.object({
  maxSizeBytes: z.number().int().positive(),
  allowedCategories: z.array(attachmentCategorySchema).min(1),
  updatedAt: z.string(),
  updatedBy: z.string().uuid().nullable(),
});

export const attachmentSettingsUpsertSchema = z.object({
  maxSizeBytes: z.number().int().positive(),
  allowedCategories: z.array(attachmentCategorySchema).min(1),
});
```
