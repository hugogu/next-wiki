# @next-wiki/mcp-server

MCP Server for [next-wiki](https://github.com/hugogu/next-wiki). Exposes the
wiki's page management surface as MCP tools and resources for Claude Code,
OpenCode, OpenClaw, and other AI-agent clients.

It covers keyword and semantic search, page CRUD and publishing workflow,
revision history, link analysis (backlinks, outbound links, and multi-hop
neighborhood), batch operations, and wiki health stats.

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

### Claude Code

Add to Claude Code MCP settings:

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

### OpenCode

Add to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "next-wiki": {
      "type": "local",
      "command": ["npx", "-y", "@next-wiki/mcp-server"],
      "environment": {
        "NEXT_WIKI_API_URL": "http://localhost:3000/api/v1",
        "NEXT_WIKI_API_KEY": "your-api-key"
      },
      "enabled": true
    }
  }
}
```

### OpenClaw

Add to `~/.openclaw/openclaw.json` (JSON5, comments and trailing commas allowed):

```json5
{
  mcp: {
    servers: {
      "next-wiki": {
        command: "npx",
        args: ["-y", "@next-wiki/mcp-server"],
        env: {
          NEXT_WIKI_API_URL: "http://localhost:3000/api/v1",
          NEXT_WIKI_API_KEY: "your-api-key",
        },
      },
    },
  },
}
```

Apply with `openclaw config validate` or reload the gateway; `mcp.*` changes hot-apply.

## Tools

| Tool | Description |
|---|---|
| `search_wiki` | Search pages by keyword (optionally filter by frontmatter) |
| `submit_semantic_search` | Submit a natural-language semantic search |
| `get_semantic_search_results` | Poll results from `submit_semantic_search` |
| `list_pages` | List visible pages |
| `get_page` | Get page details and Markdown source |
| `create_page` | Create a new page |
| `save_draft` | Save a draft revision |
| `update_page_properties` | Update page title/path |
| `publish_page` | Publish a draft revision |
| `list_revisions` | List revision history |
| `get_revision` | Get revision detail |
| `upload_image` | Upload an image and receive markdown reference |
| `get_page_tree` | Get the directory tree of pages |
| `delete_page` | Soft-delete a page |
| `get_backlinks` | Find pages linking to a target page |
| `get_page_outbound_links` | List outbound links, dangling links, and external links |
| `get_neighborhood` | Walk the link graph around a page |
| `get_diff` | Diff two revisions of a page |
| `batch_create_pages` | Create up to 50 pages atomically |
| `batch_update_pages` | Update up to 50 pages atomically |
| `batch_soft_delete_pages` | Soft-delete up to 50 pages atomically |
| `get_stats` | Wiki health overview and orphan detection |
| `find_similar` | Check for existing similar pages |

## Resources

Readable pages are exposed as MCP resources:

- URI scheme: `wiki://pages/{id}`
- MIME type: `text/markdown`

## AI Agent Usage

This MCP server is designed to be the primary interface for AI agents working
with next-wiki content. Agents should prefer these tools over direct REST calls
because auth, parameter validation, and permission checks are handled internally.

### When to use these tools

- **Knowledge retrieval**: `search_wiki`, `submit_semantic_search`, `get_semantic_search_results`, `list_pages`, `get_page`, `get_page_tree`, `find_similar`
- **Content creation**: `create_page`, `save_draft`, `publish_page`, `batch_create_pages`, `batch_update_pages`, `batch_soft_delete_pages`
- **Maintenance**: `update_page_properties`, `list_revisions`, `get_revision`, `delete_page`, `get_backlinks`, `get_page_outbound_links`, `get_neighborhood`, `get_diff`, `get_stats`
- **Media**: `upload_image` for inserting images into Markdown

### Memory conventions

When using next-wiki as AI long-term memory, prefer these path prefixes and
frontmatter metadata:

| Purpose | Path prefix | Example |
|---|---|---|
| Project context | `memory/projects/{name}/...` | `memory/projects/payment-routing` |
| Decisions | `memory/decisions/{yyyy-mm-dd}-{topic}` | `memory/decisions/2026-07-01-mcp-strategy` |
| Meeting notes | `memory/meetings/{yyyy-mm-dd}-{title}` | `memory/meetings/2026-07-01-standup` |
| Reference docs | `memory/reference/{topic}` | `memory/reference/llm-provider-matrix` |

Suggested frontmatter fields: `status`, `tags`, `owner`, `reviewed_at`,
`related_pages`.

### Prompt example

```text
Use the next-wiki MCP tools to search for pages about X, read the most
relevant one, and summarize it.
```

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
