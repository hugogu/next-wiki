# Quickstart: Public Wiki Content API

This feature makes wiki content automation possible through the stable
`/api/v1` contract.

## Prerequisites

- Start the full app using the repository Compose workflow:

```bash
docker compose up -d --build
```

- Sign in as Admin and create:
  - a Reader user and API key with `view`;
  - an Editor user and API key with `view`, `create`, and `edit`;
  - optionally an Admin key for administrative smoke tests.

## Read Workflow

```bash
curl -fsS \
  -H "Authorization: Bearer $READER_KEY" \
  "http://127.0.0.1:3000/api/v1/pages?limit=20"
```

Expected:

- Only pages readable by the Reader are returned.
- Draft-only pages from other users are absent.
- Each item has stable page and revision identity.

Read a page by path (exact lookup via the list endpoint; returns at most one item):

```bash
curl -fsS \
  -H "Authorization: Bearer $READER_KEY" \
  "http://127.0.0.1:3000/api/v1/pages?path=welcome"
```

## Create, Draft, Publish

Create a page:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"api-demo/page","title":"API Demo","contentSource":"# API Demo\nInitial content"}' \
  "http://127.0.0.1:3000/api/v1/pages"
```

Create a new draft after reading the latest revision id:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"API Demo","contentSource":"# API Demo\nUpdated content","baseRevisionId":"'$BASE_REVISION_ID'"}' \
  "http://127.0.0.1:3000/api/v1/pages/$PAGE_ID/drafts"
```

Publish the draft:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expectedRevisionId":"'$REVISION_ID'"}' \
  "http://127.0.0.1:3000/api/v1/pages/$PAGE_ID/revisions/$VERSION/publication"
```

Expected:

- Reader cannot see draft content before publication.
- Reader sees the published update after publication.
- History lists both revisions where visible.

## Upload Asset

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -F "file=@./pixel.png" \
  "http://127.0.0.1:3000/api/v1/assets"
```

Expected:

- Response includes `id`, `url`, and `markdown`.
- The Markdown reference can be inserted into a draft and becomes readable when
  the owning page/revision is visible.

## Search

```bash
curl -fsS \
  -H "Authorization: Bearer $READER_KEY" \
  "http://127.0.0.1:3000/api/v1/search/pages?q=API%20Demo"
```

Expected:

- Results include only readable pages.
- Draft and protected matches are absent for unauthorized keys.

## Permission Checks

- Reader key:
  - `GET /api/v1/pages` succeeds.
  - `POST /api/v1/pages` returns `403`.
  - `POST /api/v1/assets` returns `403`.
- Editor key:
  - create, draft, publish, and asset upload succeed for permitted pages.
- Key with `create` but Reader role:
  - create is denied because scope and role must both allow the action.

## Stale Update Drill

1. Read a page and store `latestRevision.id`.
2. Create a draft from another session or key.
3. Try to create a draft with the old `baseRevisionId`.

Expected: `409 STALE_REVISION` and no new revision is created.

## Audit and Documentation

Regenerate API documentation after any public route, schema, or annotation
change:

```bash
pnpm --filter @next-wiki/web openapi:generate
```

Do not edit `apps/web/public/openapi.json` directly. The command runs
next-openapi-gen against route annotations and `openapi-schemas.ts`, then runs a
narrow finalizer for generator output normalization and asset media types.

Verify generated API documentation:

```bash
curl -fsS http://127.0.0.1:3000/api/openapi.json | rg '"/v1/pages"'
curl -fsS http://127.0.0.1:3000/api/public-openapi.json | rg '"/v1/search/pages"'
```

Open `/api-docs` and confirm only Public v1 Wiki Content API resources are
present.

The generated OpenAPI paths are exposed without the Next.js `/api` prefix. The
full generated document is served from `/api/openapi.json`; `/api-docs` loads
the filtered `/api/public-openapi.json` view for external automation clients.

Review audit history:

- key owner sees their API-key calls in user audit;
- Admin sees all public content API calls in admin audit;
- audit rows do not contain full Markdown source or file bytes.

## MCP Server

The `@next-wiki/mcp-server` package exposes the v1 REST API as MCP tools for
AI-native clients (Claude Desktop, Cursor, etc.). The MCP Server holds the API
key internally — the AI client never sees bearer tokens.

### Prerequisites

- The wiki instance is running (e.g. `docker compose up -d --build`).
- You have created an API key with the desired scope (`view` for read-only,
  `view`+`create`+`edit` for full write access).

### Claude Desktop Configuration

Add the MCP Server to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "next-wiki": {
      "command": "npx",
      "args": ["-y", "@next-wiki/mcp-server"],
      "env": {
        "NEXT_WIKI_API_URL": "http://localhost:3000/api/v1",
        "NEXT_WIKI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. The wiki tools (`search_wiki`, `get_page`,
`create_page`, `upload_image`, `publish_page`, etc.) will be available to the
AI agent.

### Cursor Configuration

Add to Cursor settings (`Settings → MCP Servers`):

```json
{
  "mcpServers": {
    "next-wiki": {
      "command": "npx",
      "args": ["-y", "@next-wiki/mcp-server"],
      "env": {
        "NEXT_WIKI_API_URL": "http://localhost:3000/api/v1",
        "NEXT_WIKI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Local Development

For development against the monorepo source:

```bash
# Build the MCP Server package
pnpm --filter @next-wiki/mcp-server build

# Run directly from source
NEXT_WIKI_API_URL=http://localhost:3000/api/v1 \
NEXT_WIKI_API_KEY=your-api-key \
node packages/mcp-server/dist/index.js
```

### Available Tools

| Tool | Scope Required | Description |
|---|---|---|
| `search_wiki` | `view` | Search pages by keyword |
| `list_pages` | `view` | List visible pages |
| `get_page` | `view` | Get page with Markdown source |
| `create_page` | `create` | Create new page |
| `save_draft` | `edit` | Save draft revision |
| `update_page_properties` | `edit` | Update title/path |
| `publish_page` | `edit` | Publish a draft revision |
| `list_revisions` | `view` | List revision history |
| `get_revision` | `view` | Get revision detail |
| `upload_image` | `create` | Upload image, returns markdown reference |

Readable pages are also exposed as MCP resources (`wiki://pages/{id}`) for
context injection.

### Verification

After configuring the MCP Server in Claude Desktop or Cursor:

1. Ask the AI to "search the wiki for pages about X" — it should call
   `search_wiki` and return results.
2. Ask the AI to "read the page at docs/getting-started" — it should call
   `list_pages` then `get_page`.
3. With an Editor key, ask the AI to "create a new page called Test Page with
   some content and publish it" — it should call `create_page` and
   `publish_page`.
4. With a Reader key, ask the AI to create a page — it should receive a
   permission error.

## Regression

Run the normal verification set after implementation:

```bash
pnpm --filter @next-wiki/shared typecheck
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web test:e2e
pnpm --filter @next-wiki/mcp-server typecheck
pnpm --filter @next-wiki/mcp-server lint
pnpm --filter @next-wiki/mcp-server test
```

Then verify the Compose deployment:

```bash
docker compose up -d --build
docker compose ps
```
