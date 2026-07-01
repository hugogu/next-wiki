# Contract: Public Wiki Content API

All routes are versioned under `/api/v1` and are included in the generated
OpenAPI document. Authentication uses the existing Bearer API key mechanism or
first-party session where the browser calls the same public contract. Responses
use JSON except asset content endpoints.

Public route handlers are contract adapters over shared services. They must not
contain unique page, revision, asset, search, publish, or permission business
logic.

## Common Rules

- `401 UNAUTHORIZED`: no valid actor or invalid API key.
- `403 FORBIDDEN`: actor is authenticated but lacks role, scope, or page action.
- `404 NOT_FOUND`: resource missing or hidden from the caller.
- `409 CONFLICT`: duplicate path, stale revision, or conflicting resource state.
- `422 VALIDATION_FAILED`: request shape or field value is invalid.
- Error body:

```json
{
  "code": "STABLE_ERROR_CODE",
  "message": "Human-readable explanation"
}
```

## Response shape: `include` and list/search trimming

`PublicPageResource` items returned when browsing multiple pages (`GET /api/v1/pages`
without `path=`, and `GET /api/v1/search/pages`) never include `contentSource`.
Fetch Markdown source via `GET /api/v1/pages/{id}` or a specific revision endpoint.
`GET /api/v1/pages?path=...` is the exception: it returns at most one item and
behaves like a single-page lookup, so it keeps `contentSource` like `GET /pages/{id}`.

`latestRevision` and `publishedRevision` are omitted from every `PublicPageResource`
response (list, get, create, update, publish, and search's embedded `page`) unless
requested through `?include=latestRevision,publishedRevision` (comma-separated).
When omitted, the key is absent from the JSON body rather than `null`. Fetch full
revision history and content via `GET /api/v1/pages/{id}/revisions` and
`GET /api/v1/pages/{id}/revisions/{version}`.

`GET /api/v1/pages/{id}/revisions` (revision list) never includes `contentSource`
on its items either; fetch a single revision's Markdown via
`GET /api/v1/pages/{id}/revisions/{version}`.

## Pages

### `GET /api/v1/pages`

List pages visible to the caller. Items are the trimmed list shape described above.

Query:

| Param | Type | Notes |
|---|---|---|
| `status` | `published`, `draft`, `all` | Defaults to `published`; draft/all return only visible drafts |
| `q` | string | Optional path/title/content search shortcut |
| `path` | string | Optional exact canonical path lookup; returns at most one item and ignores other filters |
| `limit` | number | Default 20, max 100 |
| `cursor` | string | Optional pagination cursor |
| `order` | `path`, `recent` | Defaults to `path` |
| `include` | comma-separated: `latestRevision`, `publishedRevision` | Optional; omitted by default |

Response `200`:

```json
{
  "items": ["PublicPageResource"],
  "nextCursor": "string|null"
}
```

### `POST /api/v1/pages`

Create a page and its first draft revision.

Request:

```json
{
  "path": "docs/getting-started",
  "locale": "en",
  "title": "Getting Started",
  "contentSource": "# Getting Started\n..."
}
```

Query: `include` (see above).

Response `201`: `PublicPageResource`.

Errors:

- `409 PAGE_PATH_CONFLICT`
- `422 INVALID_PAGE_PATH`
- `403 FORBIDDEN`

### `GET /api/v1/pages/{id}`

Return a page by stable id.

Query: `include` (see above).

Response `200`: `PublicPageResource`.

Look up a page by canonical path through the list endpoint's `path` filter:
`GET /api/v1/pages?path=docs/getting-started`. The default space/locale apply.
The response is a `PublicPageListResponse` containing at most one item.

### `PATCH /api/v1/pages/{id}`

Update page properties (title and/or canonical path) without changing Markdown
source.

Query: `include` (see above).

Request:

```json
{
  "title": "New title",
  "path": "docs/new-path",
  "baseRevisionId": "uuid"
}
```

Response `200`: `PublicPageResource`.

Errors:

- `409 STALE_REVISION`
- `409 PAGE_PATH_CONFLICT`
- `422 INVALID_PAGE_PATH`

## Drafts and Revisions

### `POST /api/v1/pages/{id}/drafts`

Create a new draft revision from Markdown source.

Request:

```json
{
  "title": "Updated title",
  "contentSource": "# Updated\n...",
  "baseRevisionId": "uuid",
  "baseContentHash": "sha256..."
}
```

Response `201`: `PublicRevisionResource`.

Errors:

- `409 STALE_REVISION`
- `403 FORBIDDEN`
- `422 INVALID_MARKDOWN_SOURCE`

### `GET /api/v1/pages/{id}/revisions`

List visible revisions. Items never include `contentSource`; fetch a specific
revision's Markdown via `GET /api/v1/pages/{id}/revisions/{version}`.

Query:

| Param | Type | Notes |
|---|---|---|
| `status` | `published`, `draft`, `all` | Optional visibility filter |
| `limit` | number | Default 20, max 100 |
| `cursor` | string | Optional pagination cursor |

Response `200`:

```json
{
  "items": ["PublicRevisionResource"],
  "nextCursor": "string|null"
}
```

### `GET /api/v1/pages/{id}/revisions/{version}`

Return visible revision metadata and Markdown source when readable.

Response `200`: `PublicRevisionResource`.

### `POST /api/v1/pages/{id}/revisions/{version}/publication`

Publish an eligible draft revision.

Query: `include` (see above).

Request:

```json
{
  "expectedRevisionId": "uuid"
}
```

Response `200`: `PublicPageResource`. Pass `?include=publishedRevision` to get the
new published revision's id/publishedAt on this response.

Errors:

- `409 STALE_REVISION`
- `409 REVISION_ALREADY_PUBLISHED`
- `403 FORBIDDEN`

## Assets

### `POST /api/v1/assets`

Upload a supported asset for Markdown insertion.

Request: `multipart/form-data` with `file`.

Response `201`:

```json
{
  "id": "uuid",
  "contentType": "image/png",
  "sizeBytes": 12345,
  "url": "/api/v1/assets/{id}/content",
  "markdown": "![image](/api/v1/assets/{id}/content)",
  "createdAt": "ISO"
}
```

Errors:

- `413 ASSET_TOO_LARGE`
- `415 UNSUPPORTED_ASSET_TYPE`
- `403 FORBIDDEN`

### `GET /api/v1/assets/{id}`

Return visible asset metadata.

Response `200`: `PublicAssetResource`.

### `GET /api/v1/assets/{id}/content`

Stream asset bytes if visible to the caller.

Response `200`: bytes with validated content type.

Unreadable or missing assets return `404 NOT_FOUND`.

## Search

### `GET /api/v1/search/pages`

Search pages visible to the caller. Each result's `page` is the trimmed list
shape (no `contentSource`; see above). Instead of full content, a `content`-scope
match includes `excerpt`: the text surrounding the first match of `q`, sized by
`excerptLength`. `excerpt` is `null` for `path`/`title` matches.

Query:

| Param | Type | Notes |
|---|---|---|
| `q` | string | Required search term |
| `scope` | `path`, `title`, `content`, `all` | Defaults to `all` |
| `status` | `published`, `draft`, `all` | Defaults to `published` |
| `limit` | number | Default 20, max 100 |
| `cursor` | string | Optional pagination cursor |
| `include` | comma-separated: `latestRevision`, `publishedRevision` | Optional; omitted by default |
| `excerptLength` | number | Approximate characters of context around the match (20-500). Default 100 |

Response `200`:

```json
{
  "items": ["PublicSearchResult"],
  "nextCursor": "string|null"
}
```

## Audit

Public content API calls use the existing audit surface:

- User-owned API audit remains available to the key owner.
- Administrator-wide audit remains available to Admins.
- Audit records include route, method, status, actor/key identity, duration, and
  sanitized error. They never store full Markdown source or asset bytes.
