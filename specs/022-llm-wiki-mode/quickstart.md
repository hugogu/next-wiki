# Quickstart: Wiki Writing Modes — Verification Scenarios

**Feature**: 022-llm-wiki-mode | **Spec**: [spec.md](spec.md)

## Setup

```bash
docker compose up -d --build        # app + worker + postgres (AGENTS.md standard)
# migrations 0022 through 0024 apply at boot; seed ensures default/raw/generated spaces
```

Automated checks while developing:

```bash
pnpm --filter @next-wiki/web test          # unit/integration (Vitest)
pnpm --filter @next-wiki/web test:e2e      # Playwright
pnpm lint && pnpm typecheck
pnpm db:generate                            # must report "No schema changes" after the migration is committed
```

## S1 — Onboarding mode selection (US1, SC-001)

1. Fresh volume → open site → complete admin account + AI step.
2. **Verify**: "Writing mode" step appears before the sample-pages step; Copilot preselected.
3. Continue without changing → complete with sample pages.
4. **Verify**: `GET /api/settings/writing-mode` → `copilot`; no space switcher in nav; `GET /v1/pages?space=raw` → `403 SPACE_UNAVAILABLE`.
5. Re-run fresh, choose **LLM Wiki** → complete with sample pages.
6. **Verify**: mode = `llm-wiki`; admin sees wiki/generated/raw switcher; sample pages exist in the wiki space.

## S2 — Raw space append-only (US2, SC-003)

In LLM Wiki mode, with an admin API key:

```bash
curl -X POST $BASE/v1/pages -H "Authorization: Bearer $KEY" -d '{
  "space":"raw","path":"chats/2026-07-18-planning","title":"Planning chat",
  "inputKind":"chat-transcript","source":{"channel":"feishu"},
  "content":"# Session\n\nUser: …\nAssistant: …" }'           # 201, auto-published
curl -X POST $BASE/v1/pages/$ID/appends -H "Authorization: Bearer $KEY" \
  -d '{"content":"\nUser: follow-up…","source":{"channel":"feishu","sessionId":"planning"}}'
                                                               # 201, versionNumber=2
curl -X PATCH $BASE/v1/pages/$ID -d '{"title":"x"}'           # 403 RAW_SPACE_IMMUTABLE
curl -X DELETE $BASE/v1/pages/$ID                             # 403 RAW_SPACE_IMMUTABLE
curl -X POST $BASE/v1/pages/$ID/drafts -d '{"content":"replace"}' # 403 RAW_SPACE_IMMUTABLE
```

**Verify**: revision 1 content byte-identical after appends; revision 2 returns its immutable `source` metadata and `origin.nature=original`; anonymous `GET` of the raw path → denied; reader/editor-role keys → denied.

## S3 — Generated space OKF + provenance (US3, SC-004, SC-006)

1. MCP/API key: `create_page` (no `space`) in LLM Wiki mode → **verify** page lands in `generated` (FR-018) with injected frontmatter (`type: Note`).
2. Create with frontmatter missing `type` → `422 OKF_TYPE_REQUIRED`.
3. Create at path `index` or `docs/log` → `422 OKF_RESERVED_PATH`.
4. `GET /v1/pages/$ID` → `origin.actorKind=machine`, `origin.nature=generated`, `humanModified=false`.
5. Edit the page in the web UI (session) and publish → `humanModified=true`; the new revision returns `origin.actorKind=human` and `origin.nature=generated`.
6. Start `POST /api/transfers` with `{ "kind":"site_export", "options":{ "space":"generated", "format":"okf" } }`, wait for the artifact, and validate that every emitted `.md` file retains its original concept frontmatter with non-empty `type` and no reserved concept filename.

## S4 — Link pages (US4, SC-005, SC-009)

1. `POST /v1/pages` `{ space:"default", kind:"link", path:"guides/orders", linkTargetPageId:"<generated page id>" }` → live link page.
2. Anonymous `GET /guides/orders` → renders the target's current published content (ISR-cached body, no session data).
3. Republish the target with changed content → next read at `/guides/orders` shows the update (cache invalidated via link fan-out).
4. Unpublish/delete the target → `/guides/orders` 404s gracefully; retarget the link → path serves the new target.
5. Delete the link page → target untouched.
6. **Verify** anonymous page/tree/revision resources and sitemap output expose the wiki link path but return no generated target id/path/title or append-source provenance; anonymous access to `/spaces/generated/...` and `/spaces/raw/...` → denied; public navigation lists neither space.

## S5 — Space navigation (US5)

1. Admin UI: switcher shows wiki/generated/raw; selection is reflected in the URL (`/spaces/generated/...`, `/spaces/raw/...`) and each page renders breadcrumbs derived from the space route and page tree.
2. Non-admin authenticated user → no switcher; direct URL → denied without content leak.
3. Copilot mode → switcher gone; `/spaces/*` routes deny raw/generated.

## S6 — MCP space support (US6, SC-007)

With an MCP client (e.g. OpenCode configured per `packages/mcp-server/README.md`):

1. `list_pages(space="raw", filterType="chat-transcript", createdStart="2026-07-01T00:00:00Z")` → only chat transcripts created in the range.
2. `list_pages(space="generated", filterType="Playbook", filterTag="incident")` → matching generated pages with `origin`/`humanModified` fields.
3. `create_page({title, contentSource})` (no space) → lands in `generated`; `append_raw_entry(pageId, chunk, source)` → new revision with complete `origin` and append `source`.
4. Repeat with a reader-scoped key → raw/generated operations denied.

## S7 — Mode switching (US7, SC-002, SC-008)

1. Copilot with content → switch to LLM Wiki (admin page) → **verify** all pages untouched; raw/generated empty.
2. Populate raw + generated + one link page; create an existing wiki page at a destination such as `raw/example` to exercise conflict handling.
3. Switch back: dialog shows migration warning with per-space visibility selects (raw → Admin-only, generated → public) → confirm.
4. While the job is pending/running, attempt a raw append and a wiki edit → both return `409 MODE_SWITCH_IN_PROGRESS`; reads continue.
5. **Verify** the job moves raw pages in place to `raw/…` (restricted — anonymous denied, Admin readable), generated pages in place to `generated/…` (public), and converts the link page in place to native content. Page/revision ids and all history remain unchanged; the pre-existing wiki page is untouched and the report identifies the migrated page's suffixed path; mode = `copilot`; `/v1/pages?space=raw` → `403` again.
6. Cancel path: reopen dialog, cancel → mode unchanged, zero content changes.

## Failure drills

- Kill the worker mid-migration → the database transaction rolls back; restart → pending-job recovery retries; mode remains `llm-wiki` and no partial page move/link conversion is visible.
- Make enqueue return null/fail before a job is accepted → the matching pending marker is cleared and the request fails; content writes remain available.
- Kill the web process after the pending marker commits but before enqueue → boot recovery creates the job with the stored id exactly once.
- Force terminal migration failure → pending state clears, mode remains `llm-wiki`, and content writes resume.
- Start a content transaction immediately before requesting switch-back → the switch waits for it to commit, then later writes receive `MODE_SWITCH_IN_PROGRESS`.
- Concurrent appends to one raw entry (two keys) → both succeed with sequential version numbers; no lost chunks.
