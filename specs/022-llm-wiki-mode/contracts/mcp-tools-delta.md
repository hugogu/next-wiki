# Contract: MCP Tools Delta

**Feature**: 022-llm-wiki-mode | **Base**: `packages/mcp-server` (30 tools, registry `src/server.ts`, client `src/api-client.ts`)

Tools wrap the v1 REST API — every change below maps 1:1 to `contracts/v1-api-delta.md`. Collection/search tools accept an optional `space` argument; ID-addressed tools need no new argument because UUIDs are globally unique and the API derives permissions from the resolved resource. Unauthorized spaces/resources surface as tool errors (`SPACE_UNAVAILABLE` / `SPACE_FORBIDDEN`) rather than new MCP-side logic.

## Extended tools

| Tool | Delta |
|---|---|
| `list_pages` | + `space?: 'default' \| 'raw' \| 'generated'`; + `filterType?: string` (generated-space OKF frontmatter `type` ONLY — raw is not OKF-conformant); + `filterInputKind?: 'chat-transcript' \| 'external-fetch' \| 'script-run' \| 'manual-note'` (raw entries only; independent dimension); + `filterCategoryId?: uuid` (raw entries only; from the raw taxonomy); + `filterTag?: string`; + `createdStart?` / `createdEnd?` ISO 8601 timestamps |
| `search_wiki` | + `space?`; + `filterType?: string` (alongside existing `filterTag`, `filterStatus`, `filterOwner`, `filterHasFrontmatter`); + `filterInputKind?` and `filterCategoryId?` (raw entries only) |
| `get_page_tree` | + `space?` |
| `get_stats` | + `space?` |
| `create_page` | + `space?`; + `nature?: 'original' \| 'generated'`; + `inputKind?` + `source?` + `categoryId?` + `contentType?` + `originalBytes?` (raw creation — body preserved byte-identical, NOT OKF-injected); + `kind?: 'native' \| 'link'` + `linkTargetPageId?` (link creation). Raw forces nature `original`; link forces `generated`. Default target space follows the API rule: **generated in LLM Wiki mode** (FR-018), wiki/default otherwise |
| `list_raw_categories` | (new, see below) — list the admin-managed raw taxonomy for filing/filtering |
| `batch_create_pages` | + optional per-item `space` (same default rule) |

Page/revision results now include `kind`, permission-projected `linkTarget`, `origin { actorKind, nature }`, `humanModified`, and (for raw revisions) `contentType`, permission-projected nullable `originalAsset`, and permission-projected nullable `categoryId`; revision results include permission-projected nullable historical `linkTargetPageId` and raw append `source` metadata (flattened by `src/shapes.ts`). The API returns those provenance fields as null unless the key is Admin-backed, including after migration to a public wiki. A page's actor kind is from version 1, while a revision's actor kind describes that revision.

**OKF conformance is generated-space only** — see `contracts/okf-conformance.md`. Raw entry bodies MUST NOT be OKF-injected; the `inputKind` filter is an independent dimension, not the OKF `type` filter.

## New tool

### `append_raw_entry`

Append a new chunk to an existing raw entry (FR-020). Prior content is never modified; the server stores `current extracted text + appended chunk` as a new published revision (respecting `contentType`), plus any `originalBytes` as a new immutable `content_assets` row referenced from the new revision. No OKF injection, no format conversion.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `pageId` | uuid | yes | Raw entry page id |
| `content` | string (extracted text) | conditional | Required when `originalBytes` is absent; non-empty chunk in the entry's declared `contentType`. Stored verbatim; not OKF-injected |
| `contentType` | string | no | Defaults to the entry's existing `contentType` or `text/markdown`. Used to drive rendering and AI ingestion |
| `originalBytes` | base64 string | no | Original-format byte payload (PDF, HTML, JSON, image, raw log); stored via `content_assets`; sha256 recorded on the revision |
| `source` | object (`channel?`, `url?`, `sessionId?`, `command?`, `occurredAt?` ISO 8601) | no | Appended chunk's provenance metadata (stored in `source_metadata`, NOT in body) |

Returns: flattened revision resource (`pageId`, `versionNumber`, `revisionId`, `origin { actorKind, nature }`, `contentType`, `source`, `originalAsset` (nullable), `createdAt`).

Errors: `RAW_SPACE_IMMUTABLE` (not a raw entry), `SPACE_UNAVAILABLE` (copilot mode), `SPACE_FORBIDDEN` (key lacks raw access), `RAW_CONTENT_TYPE_MISMATCH` (declared `contentType` does not match `originalBytes`), `MODE_SWITCH_IN_PROGRESS` (switch-back write barrier active).

### `list_raw_categories`

List the admin-managed raw category taxonomy (FR-007c) so AI writers and the curation pipeline can file new source material and filter existing entries. Admin-only (or Admin-backed write-scoped keys).

| Argument | Type | Required | Notes |
|---|---|---|---|
| `includeRetired` | boolean | no | Defaults to `false`; when `true`, retired categories are included with their remaining entry counts |

Returns: flattened list of `{ id, name, slug, description, isDefault, isRetired, entryCount }`.

Errors: `SPACE_UNAVAILABLE` (copilot mode), `SPACE_FORBIDDEN` (key lacks raw access).

## Tool behavior notes for agents (README updates)

- In LLM Wiki mode, `create_page` without `space` lands in `generated`; pass `space: 'default'` explicitly to create in the public wiki space (requires publish intent).
- After a list/search result returns an id, use existing ID-addressed tools (`get_page`, `list_revisions`, `get_revision`, `get_backlinks`, `get_page_outbound_links`, `get_diff`) unchanged; the server resolves and authorizes the resource's space.
- Raw entries are immutable: `save_draft`, `update_page_properties`, `delete_page` on raw pages fail with `RAW_SPACE_IMMUTABLE`. Use `append_raw_entry` to grow an entry.
- Raw entry bodies preserve their original source format byte-identical — never OKF-injected, never markdown-converted. Pass `contentType` to declare the format; pass `originalBytes` to attach the verbatim source (PDF, HTML, JSON, image, raw log); the server stores both layers (extracted text + original bytes) and indexes the extracted text for retrieval.
- Filter raw entries by `filterInputKind` (chat-transcript | external-fetch | script-run | manual-note) and `filterCategoryId` — these are independent dimensions and MUST NOT be confused with the generated-space `filterType` (OKF `type`), which only applies to `space='generated'`. Example: `list_pages(space: 'raw', filterInputKind: 'chat-transcript', filterCategoryId: '<uuid>', createdStart: '2026-07-01T00:00:00Z')`; vs `list_pages(space: 'generated', filterType: 'Playbook', filterTag: 'incident')`.
- Raw entries MUST be filed under a category. Call `list_raw_categories` first to discover the taxonomy; pass `categoryId` on `create_page`/`append_raw_entry`. The curation pipeline (010) and any future auto-archive jobs use this category as the primary filing dimension.
- Page `origin.actorKind` reflects the creation credential; revision `origin.actorKind` reflects that write; `origin.nature` remains the page's stable classification; `humanModified=true` means a session-authenticated human has saved at least one revision.
- While switch-back is pending/running, read tools continue to work and all mutation tools surface `MODE_SWITCH_IN_PROGRESS`.
