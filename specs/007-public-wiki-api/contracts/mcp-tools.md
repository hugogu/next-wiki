# Contract: MCP Server Tools and Resources

The MCP Server (`@next-wiki/mcp-server`) exposes the v1 public REST API as MCP
tools and resources. It is a pure passthrough client — all permission, audit,
and business logic remains in the REST API.

## Configuration

The MCP Server reads its configuration from environment variables:

| Variable | Required | Description |
|---|---|---|
| `NEXT_WIKI_API_URL` | yes | Base URL of the wiki instance (e.g. `http://localhost:3000/api/v1`) |
| `NEXT_WIKI_API_KEY` | yes | API key with the desired scope (`view`, `create`, `edit`) |

The API key determines the effective permissions of all MCP tool calls. A
Reader-scoped key means write tools will return permission errors.

## Tools

Each tool maps 1:1 to a v1 REST endpoint. Tool names use `snake_case`.

### `search_wiki`

Search wiki pages by keyword. Returns only pages readable by the configured
API key.

**Maps to**: `GET /v1/search/pages`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search term |
| `scope` | `path`, `title`, `content`, `all` | no | Defaults to `all` |
| `limit` | number | no | Default 20, max 100 |

**Returns**: `{ results: [{ id, path, title, matchType, excerpt }], hasMore: boolean }`

---

### `list_pages`

List wiki pages visible to the configured API key.

**Maps to**: `GET /v1/pages`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `published`, `draft`, `all` | no | Defaults to `published` |
| `path` | string | no | Exact path lookup (returns at most one) |
| `limit` | number | no | Default 20, max 100 |
| `cursor` | string | no | Pagination cursor from previous call |

**Returns**: `{ pages: [{ id, path, title, status, locale }], hasMore: boolean, nextCursor: string|null }`

---

### `get_page`

Get a wiki page by ID, including its Markdown source if readable.

**Maps to**: `GET /v1/pages/{id}`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pageId` | string | yes | Page UUID |

**Returns**: `{ id, path, title, status, locale, contentSource, latestRevisionId, publishedRevisionId, updatedAt }`

---

### `create_page`

Create a new wiki page with an initial draft revision. Requires Editor or Admin
role.

**Maps to**: `POST /v1/pages`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Canonical page path (e.g. `docs/getting-started`) |
| `title` | string | yes | Page title |
| `contentSource` | string | yes | Markdown source |
| `locale` | string | no | Defaults to wiki default locale |

**Returns**: `{ id, path, title, status, revisionId }`

---

### `save_draft`

Save a new draft revision of an existing page. Requires Editor or Admin role.

**Maps to**: `POST /v1/pages/{id}/drafts`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pageId` | string | yes | Page UUID |
| `title` | string | yes | Title for this draft |
| `contentSource` | string | yes | Markdown source |
| `baseRevisionId` | string | recommended | Revision ID the edit is based on; stale conflict if page changed |

**Returns**: `{ revisionId, version, status: "draft" }`

---

### `update_page_properties`

Update page title and/or path without changing Markdown content. Requires
Editor or Admin role.

**Maps to**: `PATCH /v1/pages/{id}`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pageId` | string | yes | Page UUID |
| `title` | string | no | New title |
| `path` | string | no | New canonical path |
| `baseRevisionId` | string | no | Stale guard |

**Returns**: `{ id, path, title, updatedAt }`

---

### `publish_page`

Publish a draft revision, making it the current published version visible to
readers. Requires Editor or Admin role.

**Maps to**: `POST /v1/pages/{id}/revisions/{version}/publication`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pageId` | string | yes | Page UUID |
| `version` | number | yes | Revision version number to publish |
| `expectedRevisionId` | string | yes | Revision UUID for optimistic concurrency |

**Returns**: `{ id, path, title, status: "published", publishedRevisionId, publishedAt }`

---

### `list_revisions`

List revision history of a page, visible to the configured API key.

**Maps to**: `GET /v1/pages/{id}/revisions`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pageId` | string | yes | Page UUID |
| `status` | `published`, `draft`, `all` | no | Filter by revision status |
| `limit` | number | no | Default 20, max 100 |
| `cursor` | string | no | Pagination cursor |

**Returns**: `{ revisions: [{ id, version, status, author, createdAt, publishedAt }], hasMore: boolean, nextCursor: string|null }`

---

### `get_revision`

Get a specific revision's metadata and Markdown source if readable.

**Maps to**: `GET /v1/pages/{id}/revisions/{version}`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pageId` | string | yes | Page UUID |
| `version` | number | yes | Revision version number |

**Returns**: `{ id, version, status, contentType, contentSource, author, createdAt, publishedAt, canPublish }`

---

### `upload_image`

Upload an image and receive a Markdown-ready reference. The MCP tool handles
multipart form-data encoding internally — the AI client passes image bytes as
base64. Requires Editor or Admin role.

**Maps to**: `POST /v1/assets`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `imageBase64` | string | yes | Base64-encoded image bytes |
| `filename` | string | no | Original filename for content-type inference |
| `mimeType` | string | no | MIME type (e.g. `image/png`); inferred from filename if omitted |

**Returns**: `{ id, url, markdown, contentType, sizeBytes }`

The `markdown` field contains a ready-to-insert reference like
`![image](/api/v1/assets/{id}/content)`.

---

## Resources

MCP resources expose read-only wiki content for AI context injection. Resources
use the URI scheme `wiki://`.

### `wiki://pages/{id}`

Returns the full Markdown source and metadata of a readable page. The MCP
client (e.g. Claude Desktop) can subscribe to these resources to keep page
content in context during a conversation.

**Returns**: `{ mimeType: "text/markdown", text: "<Markdown source>" }`

The resource list endpoint returns all pages readable by the configured API
key, allowing the MCP client to discover available wiki content.

---

## Error Handling

MCP tool errors surface as standard MCP error responses with a `message` field
matching the v1 REST API error code:

| REST Error Code | MCP Error Message Example |
|---|---|
| `FORBIDDEN` | "Permission denied: your API key lacks the required role or scope." |
| `NOT_FOUND` | "Page not found or not visible to your API key." |
| `STALE_REVISION` | "The page was edited since you last read it. Re-read and retry." |
| `VALIDATION_FAILED` | "Invalid page path: must be lowercase with hyphens, underscores, and slashes only." |
| `PAGE_PATH_CONFLICT` | "A page with this path already exists." |

The MCP Server does not invent its own error codes — it maps REST error codes
to human-readable messages optimized for AI comprehension.
