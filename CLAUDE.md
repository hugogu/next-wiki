# next-wiki Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-06-19

## Active Technologies

- TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor). (003-content-storage-backends)

## Project Structure

pnpm workspaces + Turborepo monorepo:

```text
apps/web/                # Next.js 16 app (App Router)
  app/                   # routes (RSC) + REST route handlers under app/api/
  src/server/            # server-only: db (Drizzle schema/migrations), services,
                         #   permissions (can() chokepoint), pipeline, api, crypto
  src/components/         # UI; primitives isolated in src/components/ui/
  src/i18n/               # custom i18n (locales/en.ts canonical + zh.ts)
packages/shared/          # zero-dep shared Zod schemas/types (@next-wiki/shared)
packages/editor/          # editor package
specs/                    # Spec Kit feature specs/plans/tasks
```

## Commands

pnpm install; pnpm dev | build | lint | typecheck | test (Turborepo).
Per-app: `pnpm --filter @next-wiki/web test` (Vitest), `... test:e2e` (Playwright).
DB: `pnpm db:generate` / `pnpm db:migrate` (Drizzle). Full verify:
`docker compose up -d --build`.

## Code Style

TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor). Follow existing
conventions; see `.specify/memory/constitution.md` for binding principles.

## Recent Changes

- 003-content-storage-backends: Added TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor).

<!-- MANUAL ADDITIONS START -->

## MCP Server (AI-Agent Integration)

The project publishes `@next-wiki/mcp-server`, an MCP server that wraps the v1
Public Wiki Content API. When an agent is operating on **wiki content** — not on
the next-wiki codebase itself — it MUST prefer the MCP tools over direct REST
calls, shell `curl`, or database access.

### Why MCP first

- Auth is handled by the server process (`NEXT_WIKI_API_KEY`); the agent never
  needs to construct bearer headers or manage tokens.
- Parameters are typed and validated; responses are flattened for LLM
  comprehension.
- All operations are permission-scoped and audited through the same model as the
  web UI.
- Tools work identically across OpenCode, Claude Desktop, Cursor, and any other
  MCP-compatible client.

### When to use next-wiki MCP tools

- Search, list, read wiki pages or revisions.
- Create pages, save drafts, update properties, publish revisions.
- Upload images and receive Markdown-ready references.
- Use the wiki as long-term memory or a structured knowledge base.
- Delete outdated pages, check backlinks before reorganizing, compare revisions.
- Batch-create subtrees, monitor wiki health stats, detect duplicate pages.

### When NOT to use MCP tools

- Editing next-wiki source code, tests, specs, or configuration.
- Running `pnpm`, `docker`, `git`, or other development commands.
- Direct filesystem or database operations on the project.

### Tool invocation

In OpenCode, tools are prefixed with the configured MCP server name. If the
server is named `next-wiki`, the tools are:

| Tool | Purpose |
|---|---|
| `next-wiki_search_wiki` | Search pages by keyword |
| `next-wiki_list_pages` | List visible pages |
| `next-wiki_get_page` | Read a page including Markdown source |
| `next-wiki_create_page` | Create a new page with initial draft |
| `next-wiki_save_draft` | Save a new draft revision |
| `next-wiki_update_page_properties` | Update title/path |
| `next-wiki_publish_page` | Publish a draft revision |
| `next-wiki_list_revisions` | List revision history |
| `next-wiki_get_revision` | Read a specific revision |
| `next-wiki_upload_image` | Upload image, get Markdown reference |
| `next-wiki_get_page_tree` | Get directory tree of pages |
| `next-wiki_delete_page` | Soft-delete a page |
| `next-wiki_get_backlinks` | Find pages linking to a target page |
| `next-wiki_get_diff` | Diff two revisions of a page |
| `next-wiki_batch_create_pages` | Create up to 50 pages atomically |
| `next-wiki_get_stats` | Wiki health overview and orphan detection |
| `next-wiki_find_similar` | Check for existing similar pages |

Prompt example for OpenCode:

```text
Use the next-wiki MCP tools to search for pages about "public API", read the
most relevant one, and summarize its content.
```

### Preferred content workflow

1. **Discover**: call `next-wiki_search_wiki`, `next-wiki_list_pages`, or `next-wiki_get_page_tree` first.
2. **Read**: call `next-wiki_get_page` with the page id to retrieve Markdown
   source and revision metadata.
3. **Draft**: for edits, call `next-wiki_save_draft` with the latest revision
   context.
4. **Publish**: call `next-wiki_publish_page` when the draft should become the
   current published version.
5. **Assets**: for images, call `next-wiki_upload_image` and insert the returned
   `markdown` string into page content.
6. **Maintenance**: before deleting or moving a page, call `next-wiki_get_backlinks`
   to find references; use `next-wiki_get_diff` to review changes.

### Memory and knowledge conventions

When using the wiki as AI memory, prefer stable path prefixes and frontmatter:

| Purpose | Path prefix | Example |
|---|---|---|
| Project context | `memory/projects/{name}/...` | `memory/projects/payment-routing` |
| Decisions | `memory/decisions/{yyyy-mm-dd}-{topic}` | `memory/decisions/2026-07-01-mcp-strategy` |
| Meeting notes | `memory/meetings/{yyyy-mm-dd}-{title}` | `memory/meetings/2026-07-01-standup` |
| Reference docs | `memory/reference/{topic}` | `memory/reference/llm-provider-matrix` |

Use frontmatter for AI-readable metadata such as `status`, `tags`, `owner`,
`reviewed_at`, and `related_pages`.

### Configuration

See `packages/mcp-server/README.md` for installation and configuration in Claude
Desktop, Cursor, and OpenCode. A project-level `opencode.json` is provided as a
starting point.

<!-- MANUAL ADDITIONS END -->
