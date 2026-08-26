# next-wiki Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-08-06

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
  src/i18n/               # next-intl config/catalog loader
  messages/               # message catalogs (en.json canonical + zh.json)
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

- 037-ai-partial-page-edit: Gives Wiki AI a second, narrower way to change an
  existing page: `insert_page_content` splices one or more anchored edits
  (insert before/after, or replace an exact passage) into the current
  revision without ever asking the model to reproduce Markdown outside the
  edited spans, generalizing the existing `insert_generated_images`
  `afterText`-anchor pattern (`ai-page-content-patch.ts`, shared by both).
  Multiple edits in one call are validated against every anchor before any
  are applied, so a request lands completely or not at all; two edits whose
  resolved spans overlap reject the whole batch. `save_draft` (full-body
  rewrite) remains for genuine full rewrites, and gains a defense-in-depth
  guard: a submission below 50% of the current revision's length is rejected
  unless the caller sets `acknowledgedContentReduction: true`, closing the
  gap that let a large page's `save_draft` update silently drop most of its
  content in production. Tool-usage guidance in
  `wiki-question-tool-planner.ts` is composed per exact tool name, not the
  shared `page_draft` category — `insert_generated_images` is independently
  enabled/disabled from `create_page`/`save_draft`, so gating on category
  alone previously risked showing detailed write-tool instructions for a turn
  where none of them were actually callable.
- 035-page-slug-routing: Decouples a page's public URL from its tree path.
  Every page has a `pages.slug` — the canonical public address — separate
  from `pages.path`, which now only describes where the page lives for
  organizing, browsing, permissions, import, and export. Moving a page in
  the tree never changes its URL. Renaming a published page's slug retains
  the previous address as a permanent `kind = 'retained'` alias in the new
  `page_addresses` table (which absorbs and replaces the old
  `page_route_redirects` mechanism); an owner may also register additional
  `kind = 'manual'` aliases. One address namespace per space — every
  canonical slug, every alias, and every reserved built-in prefix — is
  validated through a single chokepoint (`assertAddressAvailable` in
  `apps/web/src/server/services/page-addresses.ts`) before any write, so a
  new or changed address can never silently steal one a reader, bookmark, or
  crawler already depends on. Wiki.js and archive imports derive a new
  page's address from its source path (or the archive's carried slug/alias
  list on a round trip), adjusting only on collision — never touching an
  existing page's address. The static site generator emits a redirect stub
  per alias. Management UI: a single `AddressManager` component shared by
  the reader's Page Properties dialog and the in-editor properties panel.
- 034-page-attachments: Lets a page have arbitrary-type file attachments
  (documents/video/images, distinct from inline-embedded images), reusing
  the existing `content_assets`/`content_blobs` storage foundation via a new
  `kind = 'attachment'` and a new page-scoped `page_attachments` join table
  (not revision/Markdown-scanned, unlike embedded images). Upload and
  download share one capability across the web UI, the public `/api/v1`
  content API, and MCP tooling. Writing requires a new, independently
  grantable API key scope (`attachments`) layered on top of existing
  page-read access; reading needs no new scope. Admin-configurable max size
  (default 20 MB) and allowed type categories live in a new singleton
  `attachment_settings` table, mirroring `site_settings`. Over-size uploads
  are rejected outright (buffer-then-validate, never truncated). No
  in-app preview; downloads use a fixed, non-configurable inline-vs-forced-
  download allowlist to avoid stored-XSS via arbitrary uploaded types.
- 031-static-site-publishing: Publishes a reader-facing static HTML site of
  publicly readable pages to a Git-served host (GitHub Pages). Independent of
  Git export — that ships raw Markdown for backup, this ships rendered HTML for
  readers; the shared piece is only the git transport helper extracted to
  `apps/web/src/server/git/transport.ts`. Generation lives in
  `apps/web/src/server/static-site/`, with one eligibility query as the sole
  content filter. New build-time deps: `esbuild` (client runtime bundle) and the
  Tailwind CLI (stylesheet); new runtime binary: pinned `pagefind_extended` in
  the runner image for chunked, CJK-capable search indexing.
- 003-content-storage-backends: Added TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor).
- 028-skill-system: Skill system + provider-agnostic tool calling. No new
  dependency. Adds a neutral tool-call envelope in `packages/shared`, native
  tool calling on the provider adapters behind
  `ai_models.tool_call_strategy`, and a bounded skill registry under
  `apps/web/src/server/services/skills/` fed by shipped packages, an optional
  read-only `SKILLS_BASE_PATH` mount, and admin-authored rows.

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
| `next-wiki_create_page` | Create a new page with initial draft (raw: verbatim body + optional original bytes) |
| `next-wiki_append_raw_entry` | Append an immutable chunk to a raw entry |
| `next-wiki_list_raw_categories` | List the raw taxonomy categories (LLM Wiki mode) |
| `next-wiki_create_raw_category` | Create a raw taxonomy category (LLM Wiki mode) |
| `next-wiki_save_draft` | Save a new draft revision |
| `next-wiki_update_page_properties` | Update title/path |
| `next-wiki_publish_page` | Publish a draft revision |
| `next-wiki_list_revisions` | List revision history |
| `next-wiki_get_revision` | Read a specific revision |
| `next-wiki_upload_image` | Upload image, get Markdown reference |
| `next-wiki_get_page_tree` | Get directory tree of pages |
| `next-wiki_delete_page` | Soft-delete a page |
| `next-wiki_delete_revision` | Soft-delete a historical revision of a page |
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

## Database Migrations (Drizzle) — never hand-author

Every schema change MUST be produced by running `pnpm db:generate`
(`drizzle-kit generate`) against the actual `src/server/db/schema/*.ts` files.
This is the only supported way to add a migration. Do not hand-write a
`NNNN_*.sql` file and manually add a matching entry to
`meta/_journal.json` — `drizzle-kit generate` is the only thing that produces
a correct `meta/NNNN_snapshot.json` alongside them, and that snapshot is
required for every future `db:generate` call to work.

**Why this matters**: `drizzle-kit generate` diffs the current schema against
the *newest snapshot file present in `meta/`*, not against the journal or the
SQL history. If a migration's snapshot is missing, the next `generate` call
silently diffs against an older snapshot instead, folds multiple real
migrations' worth of changes into one comparison, and can misread an
unrelated drop+create pair (e.g. two tables being replaced) as an ambiguous
table/column **rename**. In an agent or CI context there's no terminal to
answer that interactive prompt, so `db:generate` just blocks — for every
schema change, not just the one that broke it. This exact drift happened in
commits `044ab59` and `705fdb2` (2026-06-24 and 2026-06-28): the migrations
were hand-authored with a hand-edited `_journal.json`, and the corresponding
`meta/0020_snapshot.json` / `meta/0021_snapshot.json` were simply never
created, which broke `pnpm db:generate` for anyone touching the schema after.
This branch (`feature/ux-improvements`) repeated the same mistake for
`0022_ai_reasoning_delta.sql` / `0023_ai_question_event.sql`.

**Rules**:

- To add a schema change: edit `schema/*.ts`, then run `pnpm db:generate`.
  Never write the `.sql` migration or touch `meta/_journal.json` by hand.
- If the generated SQL needs a manual correction (rare — e.g. a cast Drizzle
  can't infer), edit only the generated `.sql` file. Never touch
  `meta/_journal.json` or the `meta/NNNN_snapshot.json` Drizzle just wrote.
- After any schema/migration change, run `pnpm db:generate` a second time
  with no further edits — it must report `No schema changes, nothing to
  migrate`. If it doesn't, or if it opens an interactive rename prompt in a
  non-interactive session, stop and investigate the snapshot chain rather
  than answering blind or patching files around it.
- If you ever discover a missing `meta/NNNN_snapshot.json` for an
  already-committed migration, don't guess at its shape: reconstruct it
  programmatically from the last valid snapshot plus the exact SQL
  statements in that migration file (each `CREATE`/`DROP`/`ALTER` maps
  directly to a snapshot diff), then confirm with `pnpm db:generate`
  reporting no changes. Verify the fix with a harmless throwaway schema
  edit (confirm it generates a clean incremental migration with no rename
  prompt), then revert the throwaway edit before committing — only the
  reconstructed snapshot(s) should ship.

<!-- MANUAL ADDITIONS END -->
