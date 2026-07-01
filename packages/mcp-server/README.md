# @next-wiki/mcp-server

MCP Server for next-wiki. Exposes the v1 Public Wiki Content API as MCP tools
and resources for Claude Desktop, Cursor, and other MCP-compatible clients.

## Installation

```bash
npm install -g @next-wiki/mcp-server
# or use npx
npx -y @next-wiki/mcp-server
```

## Configuration

The server requires two environment variables:

| Variable | Description |
|---|---|
| `NEXT_WIKI_API_URL` | Base URL of the wiki v1 API, e.g. `http://localhost:3000/api/v1` |
| `NEXT_WIKI_API_KEY` | API key generated from the wiki admin/settings |

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "next-wiki": {
      "command": "npx",
      "args": ["-y", "@next-wiki/mcp-server"],
      "env": {
        "NEXT_WIKI_API_URL": "http://localhost:3000/api/v1",
        "NEXT_WIKI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "next-wiki": {
      "command": "npx",
      "args": ["-y", "@next-wiki/mcp-server"],
      "env": {
        "NEXT_WIKI_API_URL": "http://localhost:3000/api/v1",
        "NEXT_WIKI_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `search_wiki` | Search pages by keyword |
| `list_pages` | List visible pages |
| `get_page` | Get page details and Markdown source |
| `create_page` | Create a new page |
| `save_draft` | Save a draft revision |
| `update_page_properties` | Update page title/path |
| `publish_page` | Publish a draft revision |
| `list_revisions` | List revision history |
| `get_revision` | Get revision detail |
| `upload_image` | Upload an image and receive markdown reference |

## Resources

Readable pages are exposed as MCP resources:

- URI scheme: `wiki://pages/{id}`
- MIME type: `text/markdown`

## Development

```bash
pnpm install
pnpm --filter @next-wiki/mcp-server typecheck
pnpm --filter @next-wiki/mcp-server lint
pnpm --filter @next-wiki/mcp-server test
pnpm --filter @next-wiki/mcp-server build
```

## Publishing

The package is published to npm automatically via GitHub Actions when a tag
matching `mcp-server-v*` is pushed.

### Publish a new version

1. Bump the version in `packages/mcp-server/package.json`.
2. Commit the change.
3. Create and push a tag:

```bash
git tag mcp-server-v0.1.1
git push origin mcp-server-v0.1.1
```

GitHub Actions will then build, test, and publish the package to npm with
provenance.

### Required repository secret

Add an `NPM_TOKEN` secret to the repository with publish permission for the
`@next-wiki` npm scope.
