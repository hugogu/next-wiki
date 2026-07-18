# Contract: Public REST API v1 Delta

**Feature**: 022-llm-wiki-mode | **Base**: existing v1 (`apps/web/app/api/v1/*`, schemas in `packages/shared/src/pages.ts`)

All changes are additive unless noted. Zod schemas in `packages/shared` are the source of truth; OpenAPI JSON regenerates via `next-openapi-gen` (repo rule: update docs via next-open-api on API changes). Every endpoint enforces writing-mode and space-kind permission rules (research D9): raw/generated return `403` (writes) / `404`-equivalent denial without existence leak (reads) when the mode is `copilot` or the caller lacks access.

## Query parameter: `space`

Added to: `GET /v1/pages`, `GET /v1/tree`, `GET|POST /v1/search/pages`, `GET /v1/stats`.

| Param | Type | Default | Notes |
|---|---|---|---|
| `space` | string slug: `default` \| `raw` \| `generated` | `default` | Filters the result set to one space |

`GET /v1/pages/[id]`, revisions, backlinks, links, diff: no param needed (id-addressed), but responses now carry the space context (already: `spaceSlug`) and new fields below.

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

Revision resource adds: `"origin": { "actorKind": "human | machine" }`.

Rules: `linkTarget` present only when `kind="link"` and target live; `humanModified` = any human revision exists; `visibility` included for admin callers, omitted otherwise.

## Create page — `POST /v1/pages` (extended)

New optional body fields:

| Field | Type | Notes |
|---|---|---|
| `space` | slug | Target space. Default: `default`; **when actor is an API key and mode is `llm-wiki`, default becomes `generated`** (FR-018). Session callers keep `default` |
| `nature` | `original` \| `generated` | Explicit override; default derived from actor kind (machine→generated, human→original) |
| `inputKind` | `chat-transcript` \| `external-fetch` \| `script-run` \| `manual-note` | **Required when `space=raw`**; stored as OKF `type` |
| `source` | object (`channel?`, `url?`, `sessionId?`, `command?`) | Optional raw source metadata, stored in frontmatter |
| `linkTargetPageId` | uuid | **Required when creating a link page** (`kind=link`); target must be a live generated-space native page. `content` is ignored for link creation |
| `kind` | `native` \| `link` | Default `native`; `link` only valid in the wiki space in `llm-wiki` mode |

Behavior by space: `raw` → creates entry, auto-publishes, OKF frontmatter built from `inputKind`/`source`. `generated` → OKF validation/injection (see okf-conformance.md). `wiki` + `kind=link` → creates live link page.

## New sub-resource — `POST /v1/pages/[id]/appends`

Appends content to a raw entry. `403` if the page is not in the raw space or the caller lacks raw append access.

Request: `{ "content": "markdown chunk (required, non-empty)", "source": { … } (optional) }`

Response `201`: revision resource of the new published revision (`versionNumber` incremented; `origin.actorKind` per credential).

## Rejected operations on raw pages (all actors)

`POST /v1/pages/[id]/drafts`, `PATCH /v1/pages/[id]`, `PATCH /v1/pages/[id]/metadata`, `DELETE /v1/pages/[id]`, `POST …/publication` (unpublish) → `403` with error code `RAW_SPACE_IMMUTABLE`.

## Link page operations

- Retarget: `PATCH /v1/pages/[id]` with `{ "linkTargetPageId": "uuid" }` on a link page (writes a retarget revision).
- Delete link: `DELETE /v1/pages/[id]` — soft-deletes the link page only; target unaffected.
- Native→link conversion is **not** supported (delete + recreate).

## New: writing mode settings (admin)

`GET /api/settings/writing-mode` → `{ "mode": "copilot | llm-wiki" }` (admin only).

`PUT /api/settings/writing-mode` body:

```jsonc
{ "mode": "copilot",                       // target mode
  "rawVisibility": "public | restricted",  // required when switching llm-wiki → copilot
  "generatedVisibility": "public | restricted" }
```

Response: `{ "mode": "llm-wiki" }` for forward switch; `202 { "jobId": "uuid" }` for switch-back (migration enqueued; poll existing job-status surface). Switching within the same mode is a no-op `200`.

## New: setup step (first-run)

`PUT /api/setup/writing-mode` body `{ "mode": "copilot | llm-wiki" }` → records choice, advances wizard to `sample_pages`. Setup state schema (`packages/shared/src/setup.ts`) gains step value `writing_mode` ordered between `ai` and `sample_pages`.

## Error codes (new)

| Code | HTTP | Meaning |
|---|---|---|
| `SPACE_UNAVAILABLE` | 403 | raw/generated addressed while mode is `copilot` |
| `SPACE_FORBIDDEN` | 403 | caller lacks access to the addressed space |
| `RAW_SPACE_IMMUTABLE` | 403 | edit/delete/unpublish attempted on a raw entry |
| `OKF_TYPE_REQUIRED` | 422 | generated-space write with frontmatter missing `type` |
| `LINK_TARGET_INVALID` | 422 | link target missing, not generated-space, deleted, or itself a link |
| `MODE_SWITCH_INVALID` | 422 | missing visibility choices or no-op/invalid transition |
