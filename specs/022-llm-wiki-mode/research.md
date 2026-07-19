# Research: Wiki Writing Modes — Copilot and LLM Wiki

**Date**: 2026-07-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

All Technical Context unknowns resolved. No NEEDS CLARIFICATION remains. Codebase findings from two exploration passes over `apps/web` and `packages/mcp-server` are folded into each decision.

---

## D1: Space model — `spaces.kind` column, keep `default` slug, seed all three spaces always

**Decision**: Add `kind` (`space_kind` enum: `wiki | raw | generated`) to the existing `spaces` table. The existing `default` space keeps its slug (API/MCP back-compat — `spaceSlug` is already exposed in `publicPageResourceSchema`) and gets `kind='wiki'`. New spaces use slugs `raw` and `generated`, both `anonymous_read=false`. All three spaces are seeded at boot in every mode; in Copilot mode, service guards reject raw/generated access (FR-003 "not exposed" = unreachable, not non-existent).

**Rationale**: The schema is already multi-space (`pages` unique key `(space_id, path, locale)`); only `kind` is missing. Keeping slug `default` avoids breaking existing API consumers and stored URLs. Always seeding makes Copilot→LLM Wiki a zero-migration flag flip (FR-021).

**Alternatives considered**: (a) Rename `default` → `wiki` — rejected: breaks external consumers for cosmetics. (b) Create raw/generated lazily on mode switch — rejected: two code paths for space existence; seed-once is simpler and idempotent. (c) Separate tables for raw entries — rejected per clarification Q1 and anti-pattern "AI content as second-class".

## D2: Space resolution — one `services/spaces.ts` registry, kill `DEFAULT_SPACE_SLUG` hardcoding

**Decision**: New `src/server/services/spaces.ts` exposing `getSpaceBySlug(slug)`, `getSpaceByKind(kind)`, `listSpaces()`, and `resolveSpace(param?)` (param = slug, defaults to `default`). Replace the ~10 duplicated `getDefaultSpace()` copies (`pages.ts:39`, `revisions.ts:14`, `public-content.ts:65`, `tags.ts:9`, `translations.ts:31`, `ai-retrieval.ts:16`, `public-ai.ts:10`, `search/*`, `transfer-*.ts`, `jobs/transfer-preview.ts`) with the resolver, keeping their current default behavior when no space is specified.

**Rationale**: Single traceable entry point (P10); each call site becomes space-capable without changing its default.

**Alternatives considered**: Leave hardcoded helpers and bolt raw/generated onto separate code paths — rejected: creates the parallel-path anti-pattern and doubles every future change.

## D3: Writing mode storage — singleton table + guard helpers

**Decision**: New table `writing_mode_settings` following the enforced-singleton pattern of `setup_progress` (schema `index.ts:1782`, `CHECK (id = 'default')`): columns `id` (text PK), `mode` (`writing_mode` enum `copilot | llm-wiki`, default `copilot`), nullable `pending_mode`, nullable `switch_job_id`, `updated_by`, and `updated_at`. A CHECK requires `pending_mode` and `switch_job_id` to be null or non-null together. New `services/writing-mode.ts` provides `getMode()` (cached), `getSwitchState()`, `switchMode(target, options)`, space-access guards, and a transaction helper that takes the settings-row `FOR SHARE` lock as the **first database lock** in every content mutation and rejects when a switch is pending. The switch request updates that row, so it waits for already-running content transactions before establishing the barrier; later writers see `pending_mode` and fail with `MODE_SWITCH_IN_PROGRESS`. Mode reads are cached with `unstable_cache` and invalidated on switch-state changes.

**Rationale**: Matches the project's established singleton-settings convention (site_settings, ai_settings, setup_progress); guards centralize the mode checks so no service hand-rolls them.

**Alternatives considered**: Column on `site_settings` — rejected: writing mode governs content topology, not appearance; a focused table keeps the switch transaction small and the service boundary clean.

## D4: Raw space append-only semantics — create + server-side append only, auto-published, original-format-preserving

**Decision**: Raw entries are pages (clarification Q1) with these rules enforced in the service layer (`services/raw-entries.ts` wrapping `pages.ts`):

- **Create**: allowed (Admin, Admin-backed write-scoped keys) with initial content + input kind + source metadata + assigned category; the first revision is **published immediately** (raw has no draft workflow) and page nature is forced to `original` regardless of credential kind.
- **Append**: the caller submits only the *new chunk* (plus an optional `originalBytes` payload); the service concatenates `current extracted text + separator + chunk` inside the same transaction that increments `version_number` (existing `newDraft` serialization pattern), respecting `contentType`, and publishes the new revision immediately. Any `originalBytes` payload is stored as a new immutable `content_assets` row referenced from the new revision via `original_asset_id`. Prior revisions (text + bytes) are never touched (P8 keeps them immutable).
- **Edit / delete / unpublish**: rejected for **every** actor (FR-005) — `pages.ts` guards block `newDraft` (replace-style), `updateProperties` (path/title frozen after create), and `remove` when the page's space `kind='raw'`; `can()` additionally denies `edit`/`delete` on raw-space pages so API surfaces fail fast.
- Concurrent appends serialize on the per-page version transaction; the loser retries (existing stale-base mechanism).

Input kind (`chat-transcript` / `external-fetch` / `script-run` / `manual-note`) and source metadata (`channel`, `url`, `sessionId`, `command`, `occurredAt`) live exclusively in `page_revisions.source_metadata`. They MUST NOT be encoded into the body, MUST NOT be parsed as OKF frontmatter, and MUST NOT be stored as the OKF `type` field. Raw entry bodies preserve their original source format byte-identical (see D14 for the dual-track storage decision and D15 for the raw category taxonomy). Filter channels for raw entries are `filterInputKind` and `filterCategoryId` — independent dimensions, never aliased onto the OKF `filterType` channel (which applies to the generated space only).

**Rationale**: Server-side concatenation makes "stored bytes never change" structurally guaranteed rather than convention-based; auto-publish avoids a meaningless draft state for evidence records. Keeping raw bodies format-agnostic (no OKF, no markdown conversion) preserves the original material's evidential value — the whole point of the raw space.

**Alternatives considered**: (a) Client submits full new content, server verifies prefix — rejected: wasteful and race-prone. (b) Append via draft revisions published later — rejected: drafts imply editability. (c) Store input kind in a new column — rejected as a *frontmatter* approach in earlier drafts, but **D15 now stores category in a column** (`pages.raw_category_id`) because category is admin-managed structure rather than source-derived metadata, so it belongs in the relational model with referential integrity. Input kind and source metadata remain in `source_metadata` JSONB because they are caller-supplied and per-revision. (d) Inject OKF frontmatter into raw entries — **rejected in the 2026-07-19 clarification**: OKF conformance is generated-space only, and reformatting raw material would destroy the evidential value the raw space exists to preserve.

## D5: Generated space OKF conformance — validate on write, inject minimal frontmatter when absent

**Decision**: Pages in the `generated` space are ordinary pages whose Markdown source must be an OKF v0.1 concept document. The generated-space write path uses shared helper `src/server/services/okf.ts`: path validation runs on create and every path-changing property update, while source validation runs on create and every new draft.

1. Rejects a generated concept path whose final segment is `index` or `log`; OKF reserves `index.md` and `log.md` for special structures, so treating either as an ordinary frontmatter-bearing concept would make the bundle non-conformant.
2. Parses YAML frontmatter with the existing `yaml` dependency (005 stack).
3. If **no frontmatter block exists**, injects a minimal block: `type: Note`, `title: <page title>`, `timestamp: <now ISO8601>` — OKF requires only `type` for concept frontmatter.
4. If frontmatter exists but is unparseable or `type` is missing/empty → reject with a validation error (422 via public API).
5. Unknown frontmatter keys are preserved untouched (OKF §9 permissive model).

**Bundle export**: extend the existing `site_export` transfer input with `{ options: { space: 'generated', format: 'okf' } }`. The export captures each non-deleted generated page's latest revision (draft or published) and writes it to `pages/<locale>/<path>.md` through a dedicated `okf-archive-writer.ts`, preserving the original concept frontmatter while allowing local asset URLs in the body to be rewritten to bundled paths; assets and non-Markdown manifests may coexist in the ZIP. It does not use the portable archive writer, because that writer wraps every page in next-wiki transport frontmatter and would hide the concept's required `type`. The writer validates every concept and reserved path before finalizing.

**Rationale**: Injection keeps the invariant "100% of generated pages conform" (SC-004) without forcing AI callers to be perfect; rejecting half-written frontmatter catches real caller bugs. A dedicated export is required to preserve the already-conformant source and enforce OKF's reserved-file rules.

**Alternatives considered**: (a) Reject all non-conforming writes — rejected: hostile to MCP clients; injection is friendlier and still conformant. (b) Validate only on export — rejected: violates FR-008 "stored as". (c) Reuse the portable archive writer unchanged — rejected: its transport frontmatter has no OKF `type` and nests the original source below a second frontmatter block. (d) Full OKF taxonomy/registry — rejected: OKF leaves `type` producer-defined; spec assumption records this.

## D6: Link pages — `pages.kind` + `link_target_page_id`, resolve-at-render, no content copies

**Decision**:

- `pages` gains `kind` (`page_kind` enum: `native | link`, default `native`) and `link_target_page_id` (uuid, nullable, app-enforced reference to `pages.id`, index). Constraint: `kind='link'` ⇒ `link_target_page_id NOT NULL`; target must live in the generated space and must not itself be a link (no chains).
- A link page has nature forced to `generated` and **has revisions** (P8): creating/retargeting a link page writes a revision whose `content_source` is `NULL`, `link_target_page_id` records that revision's target, and `content_html` is empty. The page row holds the current target for efficient resolution; revision rows preserve target history. Draft/publish is bypassed: link pages are live on creation, like raw entries.
- **Render**: `pages.getLive` (and cached variants) detects `kind='link'`, loads the target page's current published revision, and returns that content with the link page's own path/title. If the target is deleted/unpublished → the link path 404s gracefully (edge case in spec).
- **Tree/sitemap/navigation**: link pages appear in the wiki tree with a `kind` marker; generated target metadata is projected only to Admins, while the sitemap includes only link paths.
- **Backlinks**: target's backlink view includes link pages referencing it (uses existing link index or the new FK — implementation detail for tasks).

**Rationale**: A first-class `kind` keeps the page tree uniform (permissions, paths, soft-delete all reuse) while the FK makes fan-out invalidation and target lookups trivial. Revision-per-retarget preserves the audit trail of what was published where, when.

**Alternatives considered**: (a) Link as a frontmatter directive on an otherwise native page — rejected: invisible to queries, no fan-out, no tree marker. (b) Content-copy with sync-on-publish — rejected: violates the spec's core "no duplication" requirement. (c) Link chains allowed — rejected: ambiguity in resolution and invalidation, near-zero value.

## D7: Provenance — `page_revisions.actor_kind`, `pages.nature`, derived `humanModified`

**Decision**:

- `page_revisions.actor_kind` (`actor_kind` enum: `human | machine`, NOT NULL default `human`; existing rows backfill `human`). Set at write time from the credential (clarification Q2): session actor → `human`; api_key actor or internal pipeline write → `machine`. Internal services (translation-writer, future AI curation, migration materialization) pass `machine` explicitly.
- `page_revisions.source_metadata` (JSONB nullable). Raw entry creation and every raw append store that chunk's available channel/URL/session/command/occurrence-time metadata on the revision. Other page revisions leave it null.
- `page_revisions.link_target_page_id` (uuid nullable, app-enforced reference to `pages.id`). Link create/retarget revisions store the target active for that revision; native/raw revisions leave it null. A switch-back materialization revision retains the target it copied for audit even after the page-level target is cleared.
- `pages.nature` (`content_nature` enum: `original | generated`, NOT NULL default `original`; existing rows backfill `original`). Set at creation: raw is always `original`, link is always `generated`, and native wiki/generated pages use an explicit declaration or default machine→`generated`, human→`original`. MCP/API create accepts an optional `nature` param where the page kind does not force it.
- `humanModified` (derived, not stored): page has any revision with `actor_kind='human'` — computed in the page resource builder via a cheap `EXISTS` subquery; exposed on page resources (FR-010, FR-016).
- API/audit: `api_audit_entries` already records `origin` (`web|api|feishu`) + `key_id`; combined with `actor_kind` on revisions, FR-010 is satisfied without a new audit table. A page resource exposes `origin.actorKind` from version 1 and `origin.nature` from the page; a revision resource exposes that revision's actor kind and the joined page nature. Raw revision resources additionally expose `source` from `source_metadata` (FR-007, FR-017).

**Rationale**: Revision-level `actor_kind` is the finest truthful grain and directly powers "ever human-modified"; page-level `nature` is creation-time classification, stable for filtering and reusable on every revision response. Revision-level raw source metadata records append provenance without altering prior bytes. No new audit infrastructure is needed.

**Alternatives considered**: (a) New domain audit table — rejected: duplicates what revisions + api_audit_entries already tell. (b) `nature` per revision — rejected: nature classifies the page's origin, not each save; per-page is simpler and sufficient for filtering. (c) Writer-declared actor kind — rejected in clarification Q2 (spoofable).

## D8: Search & retrieval — space-kind-aware projection + space-kind-aware semantic retrieval

**Decision**:

- Lexical engines (tsvector, pg_trgm) and the legacy ILIKE path become space-parameterized (they already take `spaceId`; wire them to the resolver instead of `getDefaultSpaceId`).
- `candidate-projection.ts` enforces per-space visibility: wiki → existing `anonymousRead` logic; raw/generated → admin-only (and mode check). Search/MCP callers get raw/generated hits only when permitted (FR-019, SC-009).
- Generated-space filtering by OKF `type`/`tags` reuses the existing frontmatter filter channel (`filterStatus`/`filterOwner` pattern in `listPages`/`searchPages`) with a new `filterType` key while preserving `filterTag`. **`filterType` applies to the generated space only — raw entries are not OKF-conformant and their `inputKind` lives in `source_metadata` (D4).** Raw entry filtering adds two independent dimensions: `filterInputKind` (`chat-transcript`/`external-fetch`/`script-run`/`manual-note`, matched against `source_metadata->>'inputKind'`) and `filterCategoryId` (matched against `pages.raw_category_id`, see D15). `listPages` also gains `createdStart`/`createdEnd`, matching the existing search date filters.
- **Semantic retrieval is space-kind-aware (correction against the current codebase):** the `ai-index` job (`apps/web/src/server/jobs/ai-index.ts:140-143`) already indexes every published page across all spaces via `revision.contentSource` with no space filter — once raw entries are written, their extracted-text layer (D14) is indexed automatically with no new job. `ai_knowledge_chunks` has no `spaceId` column, but each chunk joins to `pages.space_id` through `pageId`. The semantic-retrieval permission check (`apps/web/src/server/services/ai-retrieval.ts:60`) currently gates on the default space's `anonymousRead` — a pre-022 invariant that becomes a leak vector once raw/generated spaces carry chunks. This feature MUST replace that gate with a per-candidate space-kind check: chunk results from `raw` and `generated` spaces are returned only to callers permitted to read those spaces (Admins and Admin-backed write-scoped keys). Anonymous and non-Admin callers receive only wiki-space chunks even when raw/generated chunks exist in the shared index.

**Rationale**: Minimal change to the search architecture mandate (engines stay replaceable behind the coordinator); permission safety stays in exactly one place (projection for lexical, post-filter for semantic). Keeping `filterType` (OKF) and `filterInputKind`/`filterCategoryId` (raw) as separate channels avoids conflating two unrelated dimensions and respects the 2026-07-19 clarification that raw is not OKF-validated.

**Alternatives considered**: (a) Add `spaceId` to chunks + re-index — rejected: not needed; chunk already joins to page. (b) Exclude raw/generated from search indexes — rejected: FR-019 requires MCP search over them, and the lexical + semantic surfaces both already work with the extracted-text layer. (c) Reuse `filterType` for raw `inputKind` — **rejected in the 2026-07-19 clarification**: raw entries have no OKF `type`, and the two filters describe different dimensions (source type vs OKF concept type). (d) Defer semantic retrieval for raw to a later feature — rejected against the current codebase: indexing already happens, so the only missing piece is the per-candidate space-kind permission filter, which is small and in-scope.

## D9: Permissions — space-kind rules inside `can()` + per-page `visibility` for migration

**Decision**:

- Extend `can()` (`permissions/index.ts`) so page-list/page resources accept a `spaceKind` input alongside `anonymousRead`:
  - `kind='raw'`: `read`/`create` → Admin role (or api_key with proper scope + Admin user); `edit`/`delete`/`publish` → **denied for all** (append is its own action guarded in the service).
  - `kind='generated'`: `read`/`create`/`edit`/`publish`/`delete` → Admin role only by default.
  - `kind='wiki'`: unchanged.
  - In Copilot mode, raw/generated resources are denied regardless (mode guard).
- `pages.visibility` (`page_visibility` enum: `public | restricted`, default `public`): `restricted` pages are readable/editable by Admin role only, in any space. Used by the switch-back migration to honor the per-source-space visibility choice (public vs Admin-only); also useful for private pages generally. `can()` `read`/`edit` check `visibility` when acting on a concrete page.

**Rationale**: Keeps one chokepoint (P5); `visibility` is the smallest honest implementation of the clarified migration choice given the product has no per-user ACL tables.

**Alternatives considered**: (a) Full per-page/per-user ACL tables — rejected: constitution scope creep for one requirement. (b) Private pages in a separate archive space on switch-back — rejected: violates FR-022 "into the wiki space as regular pages". (c) A distinct owner role — rejected: role matrix churn; the initial Admin is the owner in the personal-default product and all Admins already manage generated/wiki content.

## D10: Mode switching — pg-boss `writing-mode-switch` job

**Decision**:

- New queue `writing-mode-switch` registered explicitly in `jobs/register.ts` (P7, P10), handler `jobs/writing-mode-switch.ts`.
- **Copilot → LLM Wiki**: synchronous setting flip (spaces already seeded, D1); no job needed beyond cache invalidation.
- **LLM Wiki → Copilot request**: `switchMode('copilot', { rawVisibility, generatedVisibility })` generates a UUID, locks the singleton settings row for update, waits for content transactions holding the shared lock, records `pending_mode='copilot'` + that `switch_job_id`, commits, and calls pg-boss with `{ id: switchJobId }` (supported by the installed pg-boss 12.20 `SendOptions`). A repeated request for the same pending transition returns the existing job id; any conflicting transition returns `MODE_SWITCH_IN_PROGRESS`. If the immediate enqueue returns null or throws, the request conditionally clears the same pending id and fails; if the process dies in the post-commit/pre-enqueue gap, boot recovery verifies the job is absent and enqueues it with the stored id.
- **Content-write barrier**: every page/revision/link/raw mutation holds a shared lock on the mode row for its transaction and rejects if `pending_mode` is non-null. Reads continue. Internal migration writes use the exclusive job path.
- **Worker transaction**: the job locks the pending settings row and performs one database transaction:
  1. Compute deterministic, conflict-free destination paths in source-space/path/locale/id order.
  2. Update every raw page row in place to the wiki space at `raw/<original path>` (path conflict → deterministic suffix `-2`, `-3`, …), preserving the page id, revision ids, translation/asset/tag relations, deletion state, and history; set `visibility = rawVisibility`.
  3. Do the same for generated pages at `generated/<original path>` with `visibility = generatedVisibility`.
  4. For each active wiki link whose target has a published revision, read the target through the normal content-store abstraction and pre-generate the materialization revision id. Database-backed Markdown is written through `DatabaseStore(tx)` in the migration transaction; Local/S3 Markdown is staged external-first under that id. Insert the machine-authored revision and its normal storage-replication tasks on the **same link page**, then set `kind='native'` and clear `link_target_page_id`. A content-store read/write failure aborts the database transaction; any external object staged before a rollback is unreachable and left to the existing Markdown orphan cleanup. Soft-delete links whose target lacks published content.
  5. Set `mode='copilot'`, clear pending fields, and commit. Public cache invalidation and the replication kick run after commit.
- A transaction failure rolls back every page move/link conversion/mode change. pg-boss retries while the pending marker keeps writes blocked; terminal failure or explicit recovery clears the pending fields so LLM Wiki writes resume. Progress is reported through the job record and the UI polls with TanStack Query.

**Rationale**: In-place moves are the only approach that naturally preserves page/revision identifiers and all related records. The mode-row barrier closes the scan/write race, and one transaction prevents partial wiki moves or a half-materialized link tree from becoming visible. Routing materialized content through the content-store abstraction preserves Database/Local/S3 compatibility; external writes are staged before their revision rows become visible.

**Alternatives considered**: (a) Synchronous migration in the request — rejected: P7 (>500ms). (b) Copy then soft-delete — rejected: copied revisions need new identities, dependent records need complex remapping, retries require a durable source→destination map, and a soft-deleted link still occupies the unique `(space_id, path, locale)` key. (c) Per-page commits — rejected: readers could observe a partial topology and terminal failure could not roll back cleanly.

## D11: API surface — `space` query param, append sub-resource, origin/kind fields

**Decision** (details in `contracts/v1-api-delta.md`):

- Collection/search endpoints (`GET /v1/pages`, `/v1/tree`, `/v1/search/pages`, `/v1/stats`) accept optional `space` (slug, default `default`) and enforce mode + space-kind permissions. `GET /v1/pages` also accepts `filter[type]`, the existing `filter[tag]`, and `createdStart`/`createdEnd`. UUID-addressed page/revision/link/diff endpoints remain unchanged: they derive space and permission checks from the resolved resource, so a redundant space assertion is not added.
- `POST /v1/pages` accepts `space`; in LLM Wiki mode, when the caller is an api_key (MCP) and `space` is omitted → default becomes `generated` (FR-018); session UI callers keep `default`. `POST /v1/pages` with `space=raw` creates a raw entry (body carries `inputKind` + `source` metadata + initial content).
- New sub-resource `POST /v1/pages/[id]/appends` (raw entries only): body `{ content, source? }`; rejects non-raw pages.
- Page resources gain `kind`, permission-projected current `linkTarget`, `origin: { actorKind, nature }`, and `humanModified`. Revision resources gain `origin`, permission-projected nullable historical `linkTargetPageId`, and permission-projected nullable raw `source`; target/source provenance is Admin-only even after migration into a public wiki. `spaceSlug` already exists.
- Settings: `GET|PUT /api/settings/writing-mode` (admin; PUT accepts `{ mode, rawVisibility?, generatedVisibility? }`, returns `{ mode }` or `{ jobId }` for switch-back). Setup: `PUT /api/setup/writing-mode` records the onboarding choice.
- OpenAPI: regenerate `public/openapi.json` via `next-openapi-gen` (AGENTS.md rule: update docs via next-open-api on API changes).

**Alternatives considered**: (a) New parallel `/v1/raw/*` route tree — rejected: P11 unified entry points; space is a parameter of the same resources. (b) Verb route `/pages/[id]/append` POST is a sub-resource (`appends`) — kept RESTful (noun, POST creates an append event).

## D12: MCP surface — space params on existing tools + `append_raw_entry`

**Decision** (details in `contracts/mcp-tools-delta.md`):

- Add optional `space` to collection/search tools `list_pages`, `get_page_tree`, `search_wiki`, and `get_stats`. ID-addressed tools (`get_page`, revisions, backlinks, links, diff) need no new argument because page/revision UUIDs are globally unique and the API enforces the resolved resource's space permission.
- `create_page`: optional `space`; server-side default per D11 (generated in LLM Wiki mode for key callers).
- `search_wiki`: add `filterType` alongside the existing `filterTag`/`filterStatus`/`filterOwner` and date filters.
- `list_pages`: add `filterType`, `filterInputKind`, `filterCategoryId`, `filterTag`, `createdStart`, and `createdEnd`; raw filtering uses `filterInputKind=chat-transcript|external-fetch|script-run|manual-note` (independent dimension — raw entries are NOT OKF-conformant and `inputKind` lives in `source_metadata` per D4) and `filterCategoryId` (D15); `filterType` applies to the generated space only (OKF `type`).
- New tool `append_raw_entry(pageId, content, source?)` → `POST /v1/pages/[id]/appends`.
- `save_draft`/`update_page_properties`/`delete_page` against raw pages return the API's 403 (tool surfaces the error).

**Rationale**: FR-019/FR-020 met with minimal new surface; one filter channel for both OKF types and raw input kinds keeps the agent-facing model simple.

**Alternatives considered**: Separate `list_raw_entries`/`search_raw` tools — rejected: duplicated surface; space param is strictly simpler for agents.

## D13: Frontend — Navigator space switcher, authenticated `/spaces/[space]` routes, onboarding step, admin page

**Decision**:

- **Routes**: raw/generated browsing lives at `/spaces/[space]/[...path]` (new authenticated `(user)`-group route; Admin-gated), reusing the reader components with a space context and route/tree-derived breadcrumbs; wiki stays at `[...path]` (public ISR). Editor routes (`/new`, `/edit/[...path]`) accept a space context param and post to v1 with `space`.
- **Navigator**: when mode = llm-wiki AND actor is admin, the sidebar header renders a space switcher (wiki / generated / raw) linking to the three roots; selection is URL-derived (P11). Anonymous and non-admin users never see it (P12: outside cached body — the switcher is part of the authenticated shell, not the ISR document).
- **Link affordances**: page view shows a "linked from generated" badge (authenticated only) with target link; generated pages show a human-modified indicator (FR-016) from the `humanModified` field; a "Publish as link…" action on generated pages opens a dialog choosing the wiki path.
- **Onboarding**: `setupStepSchema` gains `writing_mode`; `STEP_ORDER = ['account','ai','writing_mode','sample_pages','summary']`; new `WritingModeStep` (radio cards: Copilot recommended/default, LLM Wiki) calling `PUT /api/setup/writing-mode`; `setup.ts` transitions updated.
- **Admin**: `/admin/writing-mode` page (nav entry under Admin) showing current mode + switch action; switching back opens a **modal dialog** (no browser alerts — project UI rule) with the migration warning and two independent visibility selects (raw → public/Admin-only, generated → public/Admin-only), then PUTs and polls job status through TanStack Query. While pending, mutation controls show the shared read-only/migration state.
- i18n: all strings added to `locales/en.ts` + `zh.ts`.

**Rationale**: URL-first space routing plus explicit breadcrumbs satisfies P11 without touching the public ISR shell; modal dialog follows the project's no-browser-alert rule, and TanStack Query owns asynchronous server state.

**Alternatives considered**: (a) Query-param-only switching (`?space=`) on the public route — rejected: would poison the ISR cache key space and mix Admin surfaces into the static shell. (b) Separate Admin-only tree page without reader rendering — rejected: Admins need to *read* raw/generated content properly, not just administer rows.

---

## D14: Raw entry storage — dual-track (extracted text + original bytes)

**Decision** (per the 2026-07-19 clarification): Each raw revision stores **two layers**, both reusing the existing 003 content-store architecture without a new storage subsystem:

1. **Extracted text** in `page_revisions.content_source` (DB text), with `page_revisions.content_type` declaring the format. This is the default surface for lexical search (tsvector/pg_trgm), AI pipeline ingestion, MCP/API read, and the default reader view. The text is **not** OKF-injected, **not** markdown-converted, and **not** semantically rewritten — it preserves the original structure byte-identical for the chunks the caller supplied.
2. **Original bytes** (when present) in `content_assets` (Database/Local/S3, already supported by 003), referenced from `page_revisions.original_asset_id` with an immutable `sha256` and the original `contentType`. This is the default surface for verbatim viewing and download. PDFs render through a viewer, images through an image viewer, JSON through a JSON viewer, HTML through sanitized HTML, logs through monospace, etc.

Write path (`services/raw-entries.ts`):

- Caller passes `content` (extracted text) **and/or** `originalBytes`. The declared `contentType` MUST match the bytes' magic-bytes/content sniffing — mismatch is rejected with `RAW_CONTENT_TYPE_MISMATCH` (rather than storing a mislabeled revision).
- If only `originalBytes` is supplied, the server derives the extracted text via the existing content pipeline before publishing the revision (PDF text extraction, HTML→text, JSON pretty-print, image OCR placeholder). If extraction is unavailable for that content type, the revision stores the original bytes alone and search indexing records the entry as `text-extraction-pending` (an operational status, not a hard failure).
- The asset row is created before the revision and never modified; `original_asset_id` is immutable on the revision.
- Append concatenates only the extracted-text layer (`current + separator + chunk`, respecting `contentType`); original-byte payloads are attached as **new** asset rows on the new revision (prior revisions' assets are never touched).

Read path:

- API/MCP default to returning the extracted text (`content_source`). The original-bytes asset is reachable through `originalAsset { assetId, contentType, size, sha256 }` on the revision resource; clients fetch the bytes through the existing `/v1/assets/[id]` surface (or a raw-specific download route).
- The reader UI dispatches by `contentType`: PDF viewer (`application/pdf`), image viewer (`image/*`), JSON viewer (`application/json`), monospace log view (`text/x-log`), sanitized HTML (`text/html`), markdown (`text/markdown`), plain text default (`text/plain`). The renderer selector is driven entirely by stored fields and never infers format from the body. A "Download original" affordance is always present when `originalAsset` is non-null.

`content_type` migration: the column was a closed enum (`text/markdown` only) under 003; this feature broadens it to an open `text` with `NOT NULL` only. Wiki/generated pages keep defaulting to `text/markdown`; raw entries use the original format. Existing rows are unaffected.

**Rationale**: Raw's three consumers (AI ingestion, lexical search, human viewing) have incompatible needs — LLM wants clean text, tsvector wants tokenizable text, humans want to see the original artifact byte-identical. Dual-track is the smallest honest implementation: the existing `content_source` already serves text consumers, and `content_assets` already serves binary consumers. No new subsystem, no parallel storage path (which would trigger the P3 anti-pattern).

**Alternatives considered**: (a) Store raw as DB-only text and discard non-markdown formats — rejected: destroys evidential value and breaks FR-007a. (b) Store raw as file-only and skip DB text — rejected: tsvector/pgvector and the existing `getLive`/cached-read path require DB-resident text; pushing them to read external files on every hit would regress read latency and break the existing 003 fallback contract. (c) New `raw_entries` table with its own storage model — rejected: creates the parallel-path anti-pattern P3 explicitly forbids; raw entries are still pages with revisions, permissions, and audit, and reusing `pages`/`page_revisions` keeps every existing service (search, link fan-out, switch-back migration) working unchanged. (d) Make original-byte storage mandatory — rejected: `manual-note` entries typically have no original bytes; forcing an asset row would be ceremony.

## D15: Raw categories — admin-managed taxonomy for filing and AI curation

**Decision** (per the 2026-07-19 clarification): Introduce an admin-managed `raw_categories` table (slug, name, description, `is_default`, `is_retired`). Every raw entry has exactly one `raw_category_id`, assigned at create and immutable thereafter (consistent with the append-only rule). Categories are filed via `pages.raw_category_id` (FK → `raw_categories.id`, `ON DELETE RESTRICT`); the per-page assignment is independent of `inputKind` (source type, stored in `source_metadata`) and of the entry's free-form path.

Lifecycle:

- **Create**: Admin seeds categories through `/api/settings/raw-categories`. At most one is `is_default=true` (partial unique index); raw creates without explicit `categoryId` silently use the default if present, else reject with `RAW_CATEGORY_REQUIRED`.
- **Retire**: `DELETE` does not remove a category — it sets `is_retired=true`. Retired categories are not selectable for new entries but remain queryable for existing ones; `DELETE` rejects with `RAW_CATEGORY_HAS_ENTRIES` when entries are still assigned (admin must retire instead). This preserves historical query integrity (you can always ask "what's in category X?" even after X stops accepting new entries).
- **Rename**: `PATCH` updates display fields without affecting assignments (per-entry assignment references the id, not the slug/name).
- **Migration backfill**: on existing deployments the table is seeded empty; existing raw entries that pre-date the taxonomy are migrated onto the first admin-created `is_default=true` category. The migration is one-shot and idempotent.

Filters:

- `filter[categoryId]` on `GET /v1/pages` and the MCP `list_pages`/`search_wiki` tools — independent dimension from `filterInputKind`. Both are independent from OKF `filter[type]` (generated-space only).

Why a column and not frontmatter/JSONB:

- Categories are admin-managed structural metadata, not source-derived content. They need referential integrity (FK), uniqueness (slug), and lifecycle (retire vs delete). Putting them in `source_metadata` JSONB would lose all three; putting them in frontmatter would force raw bodies to carry frontmatter (which FR-007a forbids). The column is the smallest honest fit.

Why per-entry immutability:

- The category captures "where this evidence was filed at the time it was captured", which is itself provenance. Allowing post-hoc re-filing would let an admin rewrite history. Re-filing is therefore done by retiring the old category and creating a new entry — the append-only model already enforces this for content, and the same rule applies to classification.

**Rationale**: Raw entries are useless without a filing dimension that survives across sources (chat vs fetch vs script vs note) and across `inputKind` (source type). Admin-managed taxonomy keeps the dimension explicit and stable for AI curation jobs (010) and any future auto-archive workflows. Per-entry immutability preserves the evidential semantics of the raw space.

**Alternatives considered**: (a) Free-form tags via the existing tag system — rejected: tags are caller-supplied and per-page; they cannot enforce a controlled taxonomy or support retire/counts lifecycle. (b) Path-prefix convention (e.g., `chats/`, `runs/`) — rejected: would conflict with the free-form path and prevent the AI curation pipeline from re-organizing material; path is also where the user wants readable slugs, not a taxonomy axis. (c) Defer categories to the AI curation feature (010) — rejected: the filing dimension must exist before AI curation runs, otherwise the first raw entries have nowhere to be filed and the AI curation pipeline has nothing to key off. (d) Allow LLM-suggested categories at write time — deferred to 010; this feature provides the taxonomy CRUD, the per-entry assignment, and the filter surface only.

---

## Resolved requirement mapping (spot check)

| Spec requirement | Decisions |
|---|---|
| FR-001/002/003 mode setting + onboarding + copilot parity | D3, D13 |
| FR-004–007 raw space | D1, D4, D9 |
| FR-007a raw byte-identical preservation + dual-track storage | D4, D14 |
| FR-007b raw dual-track storage | D14 |
| FR-007c raw category taxonomy | D15 |
| FR-008 OKF generated space (generated-only, raw NOT OKF) | D5 |
| FR-009 generated permissions / FR-010 audit distinction | D7, D9 |
| FR-011–014 link pages + public reach | D6, D11 |
| FR-015/016 navigation & indicators (incl. raw renderer dispatch) | D13, D14 |
| FR-017–020 API/MCP origin + raw/generated support (incl. filterInputKind/filterCategoryId) | D7, D8, D11, D12 |
| FR-021–023 mode switching + migration + link materialization | D10, D9 |
| SC-001–009 | verified via quickstart.md scenarios |
