# Space Migration REST and MCP Contract

All interfaces require an Administrator-authorized caller, LLM Wiki mode, and
Wiki/AI Generation source and destination spaces. Responses are permission-safe
and private; a caller never receives details about an unavailable page.

## REST resources

### Create a preview

`POST /api/v1/space-migrations/previews`

```json
{
  "selection": {
    "kind": "folder",
    "space": "default",
    "pathPrefix": "imports/ai",
    "includeRootPage": true
  },
  "destination": {
    "space": "generated",
    "pathPrefix": "imports/ai"
  },
  "excludedPageIds": []
}
```

For `kind: "page"`, `selection` carries `pageId`; the destination prefix is
the containing folder for that page's leaf name. A folder contains the selected
root page when requested plus original pages below its prefix and their linked
translation variants.

Success returns `201` with a preview ID, expiry, normalized selection,
destination mappings, item counts, required adaptations, visibility result,
conflicts, warnings, and a fingerprint. A preview containing unresolved
conflicts cannot be confirmed until conflicting pages are excluded and a fresh
preview is created.

### Confirm and start

`POST /api/v1/space-migrations`

```json
{
  "previewId": "uuid",
  "excludedPageIds": [],
  "visibility": "restricted"
}
```

Returns `202` with `{ "id": "uuid", "status": "queued", "pollUrl":
"/api/v1/space-migrations/uuid" }`. Repeating the same normalized
confirmation returns the existing operation. A stale, expired, or changed
selection returns `409 STALE_MIGRATION_PREVIEW` and makes no move.

### Read operation and items

`GET /api/v1/space-migrations/{id}` returns operation status, progress,
counts, cancellation/retry availability, terminal error, and canonical result
links safe for the caller.

`GET /api/v1/space-migrations/{id}/items?page=N` returns paginated item
outcomes: source/destination locations when authorized, adaptation summaries,
and `moved`, `excluded`, `conflicted`, `failed`, `cancelled`, or `skipped`.

### Request cancellation

`POST /api/v1/space-migrations/{id}/cancellation` requests cancellation of a
queued/running operation. The worker finishes at most its current item and
marks remaining pending items cancelled. A new preview is required to retry
unfinished or conflicted content.

## Errors

| Code | HTTP | Meaning |
|---|---:|---|
| `MIGRATION_PREVIEW_NOT_FOUND` | 404 | The preview is missing, expired, or not visible to the caller. |
| `STALE_MIGRATION_PREVIEW` | 409 | Source, destination, selection, or normalized options changed after preview. |
| `MIGRATION_ALREADY_RUNNING` | 409 | An incompatible active confirmation already owns the preview. |
| `MIGRATION_CONFLICT` | 409 | A reviewed mapping now conflicts. |
| `MIGRATION_SELECTION_INVALID` | 422 | Selection is deleted, translation-only, link, same-space, or otherwise invalid. |
| `MIGRATION_DESTINATION_INVALID` | 422 | Destination is unavailable, Raw, malformed, or colliding. |
| `RAW_SPACE_IMMUTABLE` | 403 | Raw was requested as source or destination. |
| `SPACE_UNAVAILABLE` | 403 | LLM Wiki mode or an eligible space is unavailable. |

Existing permission failures remain opaque where revealing a page would disclose
information the caller cannot read.

## MCP tools

MCP uses the same JSON shapes and result model:

- `preview_space_migration`
- `start_space_migration`
- `get_space_migration`
- `cancel_space_migration`

`start_space_migration` accepts only a preview ID and normalized confirmation
options. Tool descriptions instruct clients to preview before starting and to
poll the returned operation with `get_space_migration`.
