- DB should be brought up via docker-compose.yml
- Use `docker compose up -d --build` for testing
- Only Editor or Admin can edit page. 
- When there is API changes, update docs via next-open-api.
- **Commit workflow**: commit changes directly without asking. When a unit of work is ready (spec edit, task completion, fix, refactor, plan update), stage the relevant files and create a commit in the same turn. Do not wait for explicit "commit it". Do not push unless explicitly asked. Skip auto-commit only for in-progress or experimental work that the user might want to amend.

## UI Design Principles

- **Maximize reading space**: Functional UI (action buttons, indicators, tools) should use absolute positioning or header placement — not inline blocks that consume vertical reading space. Reference pattern: `ShareButton` in `(public)/[...path]/page.tsx` and `ProvenanceIndicators` publish-link button in `spaces/[space]/[[...path]]/page.tsx`.
- Action buttons on page view should live in the header bar alongside the title, not stacked in the content body.

## Background Job Cache Context

- pg-boss workers and other background handlers do not have a Next.js request cache context. Service boundaries called from them must use `runWithoutDataCache` before reaching code that may invoke `unstable_cache` or revalidation APIs.

## Active Technologies
- TypeScript 5.6, Node.js 20.9+, Next.js 16, React 19, Drizzle ORM, pg-boss (004-system-ai-support)
- PostgreSQL 16 with pgvector 0.8.x; existing Database/Local/S3 content storage (004-system-ai-support)
- TypeScript 5.6 on Node.js 20.9+ (Docker uses Node 24), React 19.2, Next.js 16 + Existing Next.js/Drizzle/pg-boss/Zod/unified stack; add `yazl` for streaming ZIP creation, `yauzl` for lazy validated ZIP reads, `yaml` for frontmatter, `turndown` for supported Wiki.js HTML conversion, and `ipaddr.js` for normalized network-range checks (005-content-import-export)
- PostgreSQL 16 for transfer metadata and state; existing content stores for Markdown/images; local persistent artifact directory under `/data/content/transfers` for ZIP uploads, exports, and reports (005-content-import-export)
- TypeScript 5.6 on Node.js 20.9+; Docker image tracks Node 24 + Next.js 16 App Router, React 19.2, Drizzle ORM, Zod, (007-public-wiki-api)
- Existing PostgreSQL 16 database and current content storage backends; (007-public-wiki-api)

## Recent Changes
- 004-system-ai-support: Planned system AI providers, capability-aware models, pgvector retrieval, async AI actions, and governed editor/chat features.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/026-wiki-ai-tool-runtime/plan.md
<!-- SPECKIT END -->

## Database Migrations (Drizzle) — never hand-author

Every schema change MUST be produced by running `pnpm db:generate`
(`drizzle-kit generate`) against the actual `src/server/db/schema/*.ts` files.
Never hand-write a `NNNN_*.sql` migration file and manually add a matching
entry to `meta/_journal.json` — only `drizzle-kit generate` produces the
matching `meta/NNNN_snapshot.json`, and that snapshot is required for every
future `db:generate` call to work correctly.

Why: `drizzle-kit generate` diffs the current schema against the newest
snapshot file present in `meta/`, not against the journal or SQL history. A
missing snapshot makes the next `generate` call diff against a stale base,
folding multiple migrations into one comparison and misreading unrelated
drop+create pairs as ambiguous renames — which opens an interactive prompt
that blocks `db:generate` entirely in agent/CI contexts. This happened for
`0020`-`0021` (main) and `0022_ai_reasoning_delta.sql` /
`0023_ai_question_event.sql` (this branch) — all hand-authored instead of
generated.

Rules: edit `schema/*.ts` then run `pnpm db:generate`, never author the
`.sql`/`_journal.json` by hand; after any change re-run `pnpm db:generate`
and confirm it reports "No schema changes, nothing to migrate"; if a
snapshot is ever found missing, reconstruct it from the last valid snapshot
plus the exact SQL statements and verify with a throwaway schema edit before
reverting it.
