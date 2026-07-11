# Quickstart: Validate Page Tags and Metadata

## Prerequisites

- Node.js 20.9+, pnpm 10, and PostgreSQL.
- `edit` for page metadata; `manage_tags` for lifecycle checks.

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/mcp-server test
```

Start the application and worker with the normal repository development
commands before running a tag rename/delete.

## Browser checks

1. Save a Markdown page with `title`, `date`, `tags`, and `summary` frontmatter.
2. Confirm the reader renders labelled date/tags/summary before the body and
   does not repeat YAML delimiters in article content.
3. Change metadata through properties; confirm supported frontmatter changes
   while unrelated keys/body content remain unchanged.
4. Confirm homepage and `/pages` cards prefer a summary and retain fallback
   description when summary is absent.
5. Rename/delete a shared tag, wait for the mutation to succeed, then verify
   every affected page and source frontmatter converged.

## REST and MCP checks

1. Use the metadata resource in [rest-api.md](./contracts/rest-api.md) with a
   current revision id.
2. Read/list/search the page and confirm raw frontmatter and typed metadata
   agree.
3. Use `list_tags`, create a tag, and call `update_page_metadata` through MCP.
4. Poll a rename/delete operation to completion; verify a view-only credential
   cannot mutate or discover inaccessible-page details.

## Required automated coverage

- Parser/serializer round trips and valid-frontmatter render stripping.
- Revision snapshots, normalization, stale writes, and lifecycle rollback.
- REST/OpenAPI authorization and backward compatibility.
- MCP legacy `filterTag` plus new tool behavior.
- Reader/list UI and E2E summary/metadata behavior.
