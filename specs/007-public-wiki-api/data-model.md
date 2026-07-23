# Data Model: Public Wiki Content API

This feature mainly exposes stable external representations of existing wiki
entities. It does not require new persistence tables for the MVP.

## Public Page Resource

Represents one wiki page as seen through the public content API.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Stable page identifier |
| `spaceSlug` | string | Defaults to the existing default space for this feature |
| `path` | string | Canonical page path within the space/locale |
| `locale` | string | Locale associated with the page |
| `title` | string | Current page title |
| `status` | enum | `draft`, `published`, or `deleted` where visible to caller |
| `author` | object | Non-sensitive author id/display name where visible |
| `latestRevision` | Public Revision Summary | Latest visible revision for caller |
| `publishedRevision` | Public Revision Summary or null | Current published revision where visible |
| `createdAt` | ISO timestamp | Page creation time |
| `updatedAt` | ISO timestamp | Page update time |
| `links` | object | Canonical API URLs for details, revisions, drafts, publication, assets/search where applicable |

### Validation

- `path` follows existing path rules: lowercase letters, numbers, hyphens, underscores, and
  slashes; no leading, trailing, or consecutive slashes.
- `(space, path, locale)` remains the canonical identity.
- Deleted or unreadable pages must appear as not found to unauthorized callers.

## Public Revision Resource

Represents one immutable page revision.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Stable revision identifier |
| `pageId` | uuid | Owning page |
| `version` | integer | Page-local revision number |
| `status` | enum | `draft` or `published` |
| `contentType` | string | `text/markdown` for this feature |
| `contentSource` | string or omitted | Returned only when caller may read source |
| `contentHash` | string | Source hash for stale detection and traceability |
| `author` | object | Non-sensitive author id/display name where visible |
| `createdAt` | ISO timestamp | Revision creation time |
| `publishedAt` | ISO timestamp or null | Publication time |
| `canPublish` | boolean | Whether the current caller may publish this revision |

### State Transitions

```text
draft --publish--> published
```

- Creating a page creates revision `1` as a draft unless a future plan
  explicitly supports create-and-publish.
- Updating page content creates a new draft revision.
- Publishing marks the selected revision as published and makes it the page's
  current published revision.
- Revisions are immutable; updates create new revisions.

## Public Page Create Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | Canonical path |
| `locale` | string | no | Defaults to current default locale |
| `title` | string | yes | 1-200 characters |
| `contentSource` | string | yes | Markdown source |

## Public Draft Create Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | New page title for the draft |
| `contentSource` | string | yes | Markdown source |
| `baseRevisionId` | uuid | recommended | Revision the client edited from; conflict if stale |
| `baseContentHash` | string | optional | Extra stale guard for clients that store hashes |

### Stale Update Rule

When `baseRevisionId` is supplied and the current latest revision differs, the
public API returns a stale-revision conflict instead of creating a new draft.
Clients may retry by reading the latest source and resubmitting.

## Public Page Properties Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | string | optional | New canonical path |
| `title` | string | optional | Title-only update when content does not change |
| `baseRevisionId` | uuid | optional | Stale guard when changing properties after reading page |

## Public Asset Resource

Represents an uploaded asset.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Stable asset identifier |
| `contentType` | string | Validated media type |
| `sizeBytes` | integer | Stored byte size |
| `url` | string | Public content URL |
| `markdown` | string | Markdown-ready insertion string |
| `createdAt` | ISO timestamp | Upload time where visible |

### Validation

- Uploads obey existing size and media validation.
- Reads return not found when the caller cannot read any visible page/revision
  referencing the asset and is not the uploader within the temporary upload
  window.

## Public Search Result

| Field | Type | Notes |
|---|---|---|
| `page` | Public Page Summary | Page metadata |
| `matchType` | enum | `path`, `title`, or `content` |
| `excerpt` | string or null | Bounded non-sensitive excerpt |
| `score` | number or null | Optional rank value |

### Validation

- Results include only pages readable by the caller.
- Draft-only matches are returned only to callers who may read those drafts.

## API Key Actor

Existing actor representation combining key identity, owning user id, owning
user role, and immutable scopes.

### Permission Mapping

| Operation | Required scope | Role gate |
|---|---|---|
| list/read/search published pages | `view` | Reader, Editor, Admin |
| read own/editable drafts | `view` | Editor/Admin or author rules |
| create page | `create` | Editor/Admin |
| create draft/update properties/publish | `edit` | Editor/Admin or existing author publish rule |
| upload asset | `create` or `edit` | Editor/Admin |
| delete/restore if later included | `delete` | Admin or author rule |

## Audit Entry

Existing audit entity records API-key and session calls.

### Public API Requirements

- Record method, path, actor, key id, status, duration, and sanitized error.
- Do not record full Markdown source, request body, uploaded bytes, or rendered
  content.

## MCP Tool

An MCP tool is a named, typed operation that maps 1:1 to a v1 REST endpoint.
The MCP Server introduces no new persistent data — tools are stateless
passthrough calls to the REST API.

### Tool Inventory

| Tool Name | REST Endpoint | Scope Required | Description |
|---|---|---|---|
| `search_wiki` | `GET /v1/search/pages` | `view` | Search pages by keyword |
| `list_pages` | `GET /v1/pages` | `view` | List visible pages |
| `get_page` | `GET /v1/pages/{id}` | `view` | Get page with source |
| `create_page` | `POST /v1/pages` | `create` | Create new page |
| `save_draft` | `POST /v1/pages/{id}/drafts` | `edit` | Save draft revision |
| `update_page_properties` | `PATCH /v1/pages/{id}` | `edit` | Update title/path |
| `publish_page` | `POST /v1/pages/{id}/revisions/{ver}/publication` | `edit` | Publish revision |
| `list_revisions` | `GET /v1/pages/{id}/revisions` | `view` | List revision history |
| `get_revision` | `GET /v1/pages/{id}/revisions/{ver}` | `view` | Get revision detail |
| `upload_image` | `POST /v1/assets` | `create` | Upload image, return markdown ref |

### Response Shape Transformation

MCP tool responses flatten REST envelopes into LLM-friendly shapes:

| REST Field | MCP Field | Rationale |
|---|---|---|
| `items` | Domain-specific (`pages`, `revisions`, `results`) | Clearer for LLM selection |
| `nextCursor` | `nextCursor` + `hasMore` boolean | Explicit signal for pagination |
| HTTP status codes | Omitted | Errors surface as MCP error responses |
| Nested `links` objects | Flattened ID fields | Reduces token overhead |

## MCP Resource

An MCP resource exposes readable wiki content via the `wiki://` URI scheme.

| Field | Type | Notes |
|---|---|---|
| `uri` | string | `wiki://pages/{id}` |
| `mimeType` | string | Always `text/markdown` |
| `text` | string | Full Markdown source of the readable page |

### Resource Discovery

The MCP Server exposes a resource list endpoint that returns all pages readable
by the configured API key, allowing MCP clients to discover available content
without tool calls.
