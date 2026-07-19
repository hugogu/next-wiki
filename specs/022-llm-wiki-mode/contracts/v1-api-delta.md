# Contract: Public REST API v1 Delta

**Feature**: 022-llm-wiki-mode | **Base**: existing v1 (`apps/web/app/api/v1/*`, schemas in `packages/shared/src/pages.ts`)

All changes are additive unless noted. Zod schemas in `packages/shared` are the source of truth; OpenAPI JSON regenerates via `next-openapi-gen` (repo rule: update docs via next-open-api on API changes). Every endpoint enforces writing-mode and space-kind permission rules (research D9): raw/generated return `403` (writes) / `404`-equivalent denial without existence leak (reads) when the mode is `copilot` or the caller lacks access.

## List/search query parameters

Added to: `GET /v1/pages`, `GET /v1/tree`, `GET|POST /v1/search/pages`, `GET /v1/stats`.

| Param | Type | Default | Notes |
|---|---|---|---|
| `space` | string slug: `default` \| `raw` \| `generated` | `default` | Filters the result set to one space |

`GET /v1/pages` additionally accepts `filter[type]` (generated-space OKF frontmatter `type`; ignored for raw), `filter[inputKind]` (raw entries only — independent of OKF `type`), `filter[categoryId]` (raw entries only — see raw categories admin API), the existing `filter[tag]`, and `createdStart` / `createdEnd` ISO 8601 timestamps. The creation-time pair follows the same ordering validation already used by search. The `inputKind` filter MUST NOT be encoded through `filter[type]`: raw entries are not OKF-conformant and `inputKind` lives in `page_revisions.source_metadata`, not the body.

`GET /v1/pages/[id]`, revisions, backlinks, links, and diff remain ID-addressed and add no redundant `space` parameter. They derive space-kind permission checks from the resolved resource and return the same not-found response for inaccessible content. Responses carry the space context (already: `spaceSlug`) and the new fields below.

## Resource field additions (`publicPageResourceSchema`, `publicRevisionResourceSchema`)

Page resource:

```jsonc
{
  // …existing fields incl. spaceSlug…
  "kind": "native | link",
  "linkTarget": null | { "pageId": "uuid", "path": "string", "title": "string" },
  "origin": { "actorKind": "human | machine", "nature": "original | generated" },
  "humanModified": true,
  "visibility": "public | restricted"
}
```

Revision resource adds:

```jsonc
{
  "origin": { "actorKind": "human | machine", "nature": "original | generated" },
  "contentType": "text/markdown",                       // default; raw entries use original format (text/plain, text/html, application/json, application/pdf, text/x-log, image/* …)
  "source": null | { "channel": "string?", "url": "string?", "sessionId": "string?", "command": "string?", "occurredAt": "ISO 8601 string?" },
  "originalAsset": null | { "assetId": "uuid", "contentType": "string", "size": number, "sha256": "string" },   // raw only: immutable reference to original bytes through content_assets
  "categoryId": "uuid | null",                          // raw only; immutable after creation
  "linkTargetPageId": "uuid | null"
}
```

Rules: page `origin.actorKind` comes from version 1; revision `origin.actorKind` comes from that revision; both use the stable `pages.nature`. Raw pages force nature `original`; link pages force nature `generated`. `source` is populated only for raw create/append revisions. `originalAsset` is populated only for raw revisions that carry an original-byte payload; the asset itself is fetched through the existing `/v1/assets/[id]` surface (or a raw-specific download route) and is integrity-checked by `sha256` against the immutable stored hash. `categoryId` is populated only for raw entries; immutable after creation. Revision `linkTargetPageId` records the historical target for link create/retarget/materialization revisions. Page `linkTarget`, revision `linkTargetPageId`, revision `source`, revision `originalAsset`, and revision `categoryId` are Admin-only provenance fields: unauthorized/public projections return null and never disclose generated target identifiers/paths/titles, append metadata, original asset references, or category assignments, including after a page is migrated into a public wiki. `humanModified` = any human revision exists; `visibility` is included for Admin callers and omitted otherwise.

## Create page — `POST /v1/pages` (extended)

New optional body fields:

| Field | Type | Notes |
|---|---|---|
| `space` | slug | Target space. Default: `default`; **when actor is an API key and mode is `llm-wiki`, default becomes `generated`** (FR-018). Session callers keep `default` |
| `nature` | `original` \| `generated` | Explicit override for native wiki/generated pages; default derived from actor kind (machine→generated, human→original). Raw forces `original`; link forces `generated` |
| `inputKind` | `chat-transcript` \| `external-fetch` \| `script-run` \| `manual-note` | **Required when `space=raw`**; stored in `source_metadata`, NOT in the body |
| `categoryId` | uuid | **Required when `space=raw`** unless the admin has configured a default raw category (then applied silently if omitted). Must reference a non-retired `raw_categories` row; immutable after creation |
| `contentType` | string (`text/markdown` \| `text/plain` \| `text/html` \| `application/json` \| `application/pdf` \| `text/x-log` \| `image/*` …) | **Required when `space=raw`** and the body is not markdown; defaults to `text/markdown`. Stored on the revision; verifies byte-payload via content sniffing when an `originalAssetId` or `originalBytes` is supplied |
| `content` | string (extracted text) | Required unless `originalBytes` is supplied and server-side extraction is enabled; the extracted-text representation used for retrieval/rendering/AI. NOT modified, reformatted, or OKF-injected; stored verbatim |
| `originalBytes` | base64 string \| multipart upload | Optional raw-only payload (PDF, HTML, JSON export, image, raw log). Stored through the existing `content_assets` abstraction (Database/Local/S3); its sha256 is recorded on the revision. When `content` is omitted the server derives the extracted text via the existing content pipeline before publishing the revision |
| `source` | object (`channel?`, `url?`, `sessionId?`, `command?`, `occurredAt?` ISO 8601) | Optional raw source metadata, stored in `source_metadata` (NOT in body) |
| `linkTargetPageId` | uuid | **Required when creating a link page** (`kind=link`); target must be a live generated-space native page. `content` is ignored for link creation |
| `kind` | `native` \| `link` | Default `native`; `link` only valid in the wiki space in `llm-wiki` mode |

Behavior by space: `raw` → creates entry, auto-publishes, body preserved byte-identical with declared `contentType`, no OKF frontmatter or format conversion; `originalBytes` (if supplied) stored as a `content_assets` row referenced from the revision. `generated` → OKF validation/injection (see okf-conformance.md). `wiki` + `kind=link` → creates live link page.

## New sub-resource — `POST /v1/pages/[id]/appends`

Appends content to a raw entry. `403` if the page is not in the raw space or the caller lacks raw append access.

Request: `{ "content": "extracted text chunk (optional when originalBytes supplied)", "contentType": "text/markdown | text/plain | text/html | application/json | text/x-log | …", "originalBytes": "base64 (optional)", "source": { … } (optional) }`

The appended chunk MUST preserve its original format byte-identical (no OKF, no markdown conversion, no semantic rewriting); the new published revision stores `current extracted text + appended chunk` as `content_source` (server-side concatenation respecting `contentType`), and any `originalBytes` as a new immutable `content_assets` row referenced from the new revision. The revision's `contentType` records the appended chunk's format. Prior revisions (text + bytes) are never touched.

Response `201`: revision resource of the new published revision (`versionNumber` incremented; `origin.actorKind` per credential; stable `origin.nature=original`; `source` equals this append's metadata; `originalAsset` reflects any uploaded payload).

## Raw categories — admin taxonomy API

Admin-only CRUD used to file raw entries for retrieval and AI curation (FR-007c). Available in `llm-wiki` mode only; returns `SPACE_UNAVAILABLE` in `copilot` mode.

- `GET /api/settings/raw-categories` → `{ "categories": [{ "id": "uuid", "name": "string", "slug": "string", "description": "string?", "isDefault": boolean, "isRetired": boolean, "entryCount": number, "createdAt": ISO8601, "updatedAt": ISO8601 }, …] }`
- `POST /api/settings/raw-categories` body `{ "name": string, "slug"?: string, "description"?: string, "isDefault"?: boolean }` → `201` returns the created category. Setting `isDefault=true` clears the flag on the previous default.
- `PATCH /api/settings/raw-categories/[id]` body `{ "name"?, "slug"?, "description"?, "isDefault"? }` (a category cannot be un-retired to `isDefault=true` while retired without first clearing `isRetired`). Renaming does not affect already-assigned entries (immutable per-entry assignment references the id).
- `DELETE /api/settings/raw-categories/[id]` → marks the category `isRetired=true` instead of removing it; rejects with `409 RAW_CATEGORY_HAS_ENTRIES` when entries are still assigned; admins may list retired categories and their counts via the GET endpoint.

Categories are referenced from raw-entry create/append through `categoryId`; auto-categorization (LLM suggestion) is deferred to the AI curation feature (010).

## Rejected operations on raw pages (all actors)

`POST /v1/pages/[id]/drafts`, `PATCH /v1/pages/[id]`, `PATCH /v1/pages/[id]/metadata`, `DELETE /v1/pages/[id]`, `POST …/publication` (unpublish) → `403` with error code `RAW_SPACE_IMMUTABLE`.

## Link page operations

- Retarget: `PATCH /v1/pages/[id]` with `{ "linkTargetPageId": "uuid" }` on a link page (writes a retarget revision).
- Delete link: `DELETE /v1/pages/[id]` — soft-deletes the link page only; target unaffected.
- Native→link conversion is **not** supported (delete + recreate).

## New: writing mode settings (admin)

`GET /api/settings/writing-mode` → `{ "mode": "copilot | llm-wiki", "pendingMode": "copilot | llm-wiki | null", "switchJobId": "uuid | null" }` (Admin only).

`PUT /api/settings/writing-mode` body:

```jsonc
{ "mode": "copilot",                       // target mode
  "rawVisibility": "public | restricted",  // required when switching llm-wiki → copilot
  "generatedVisibility": "public | restricted" }
```

Response: `{ "mode": "llm-wiki" }` for forward switch; `202 { "jobId": "uuid" }` for switch-back (migration enqueued; poll existing job-status surface). Repeating the same pending switch returns the existing job id with 202 instead of enqueuing a duplicate. Switching within the same stable mode is a no-op `200`; a conflicting request while another switch is pending returns `409 MODE_SWITCH_IN_PROGRESS`.

After a switch-back is accepted, every content mutation endpoint returns `409 MODE_SWITCH_IN_PROGRESS` until the migration commits or terminal failure rolls it back. Read endpoints remain available.

## New: setup step (first-run)

`PUT /api/setup/writing-mode` body `{ "mode": "copilot | llm-wiki" }` → records choice, advances wizard to `sample_pages`. Setup state schema (`packages/shared/src/setup.ts`) gains step value `writing_mode` ordered between `ai` and `sample_pages`.

## Error codes (new)

| Code | HTTP | Meaning |
|---|---|---|
| `SPACE_UNAVAILABLE` | 403 | raw/generated addressed while mode is `copilot` |
| `SPACE_FORBIDDEN` | 403 | caller lacks access to the addressed space |
| `RAW_SPACE_IMMUTABLE` | 403 | edit/delete/unpublish attempted on a raw entry |
| `RAW_CATEGORY_REQUIRED` | 422 | raw entry created without a `categoryId` and no admin-configured default exists |
| `RAW_CATEGORY_RETIRED` | 422 | raw entry created with a `categoryId` whose category is retired |
| `RAW_CONTENT_TYPE_MISMATCH` | 422 | declared `contentType` does not match the supplied `originalBytes` (sniffing check) |
| `RAW_CATEGORY_HAS_ENTRIES` | 409 | attempt to delete a raw category that still has entries assigned (use retire instead) |
| `OKF_TYPE_REQUIRED` | 422 | generated-space write with frontmatter missing `type` |
| `OKF_RESERVED_PATH` | 422 | generated-space concept path ends in reserved `index` or `log` |
| `LINK_TARGET_INVALID` | 422 | link target missing, not generated-space, deleted, or itself a link |
| `MODE_SWITCH_INVALID` | 422 | missing visibility choices or invalid transition |
| `MODE_SWITCH_IN_PROGRESS` | 409 | content mutation or conflicting mode change attempted while a switch is pending/running |
