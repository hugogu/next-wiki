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

**Decision**: New table `writing_mode_settings` following the enforced-singleton pattern of `setup_progress` (schema `index.ts:1782`, `CHECK (id = 'default')`): columns `id` (text PK), `mode` (`writing_mode` enum `copilot | llm-wiki`, default `copilot`), `updated_by`, `updated_at`. New `services/writing-mode.ts` with `getMode()` (cached), `switchMode(target, options)` (validates, enqueues migration job for switch-back), and guards `requireRawAccess()` / `requireGeneratedAccess()` used by services. Mode reads are cached with `unstable_cache` and invalidated on switch.

**Rationale**: Matches the project's established singleton-settings convention (site_settings, ai_settings, setup_progress); guards centralize the mode checks so no service hand-rolls them.

**Alternatives considered**: Column on `site_settings` — rejected: writing mode governs content topology, not appearance; a focused table keeps the switch transaction small and the service boundary clean.

## D4: Raw space append-only semantics — create + server-side append only, auto-published

**Decision**: Raw entries are pages (clarification Q1) with these rules enforced in the service layer (`services/raw-entries.ts` wrapping `pages.ts`):

- **Create**: allowed (owner/admin, write-scoped keys) with initial content + input kind + source metadata; the first revision is **published immediately** (raw has no draft workflow).
- **Append**: the caller submits only the *new chunk*; the service concatenates `current content + separator + chunk` inside the same transaction that increments `version_number` (existing `newDraft` serialization pattern), and publishes the new revision immediately. Prior revisions are never touched (P8 keeps them immutable).
- **Edit / delete / unpublish**: rejected for **every** actor (FR-005) — `pages.ts` guards block `newDraft` (replace-style), `updateProperties` (title edits allowed? — no: path/title frozen after create), and `remove` when the page's space `kind='raw'`; `can()` additionally denies `edit`/`delete` on raw-space pages so API surfaces fail fast.
- Concurrent appends serialize on the per-page version transaction; the loser retries (existing stale-base mechanism).

Input kind + source metadata are stored in page frontmatter (OKF-style) **and** indexed columns are not needed — filtering uses frontmatter keys (consistent with D8 search decision).

**Rationale**: Server-side concatenation makes "stored bytes never change" structurally guaranteed rather than convention-based; auto-publish avoids a meaningless draft state for evidence records.

**Alternatives considered**: (a) Client submits full new content, server verifies prefix — rejected: wasteful and race-prone. (b) Append via draft revisions published later — rejected: drafts imply editability. (c) Store input kind in a new column — rejected: frontmatter keeps pages schema generic and matches OKF conventions; filter needs are met by frontmatter filters already present in search/list APIs (`filterStatus`, `filterOwner` pattern).

## D5: Generated space OKF conformance — validate on write, inject minimal frontmatter when absent

**Decision**: Pages in the `generated` space are ordinary pages whose Markdown source must be an OKF v0.1 concept document. On every create/draft in the generated space, the write path (`pages.ts` create/newDraft hook, shared helper `src/server/services/okf.ts`):

1. Parses YAML frontmatter with the existing `yaml` dependency (005 stack).
2. If **no frontmatter block exists**, injects a minimal block: `type: Note`, `title: <page title>`, `timestamp: <now ISO8601>` — OKF requires only `type`.
3. If frontmatter exists but `type` is missing/empty → reject with a validation error (422 via public API).
4. Unknown frontmatter keys are preserved untouched (OKF §9 permissive model).

Export-as-OKF-bundle is satisfied at source level: the 005 transfer/export already exports page Markdown + frontmatter, so a generated-space export is a conformant bundle by construction (no new exporter in this feature).

**Rationale**: Injection keeps the invariant "100% of generated pages conform" (SC-004) without forcing AI callers to be perfect; rejecting half-written frontmatter catches real caller bugs.

**Alternatives considered**: (a) Reject all non-conforming writes — rejected: hostile to MCP clients; injection is friendlier and still conformant. (b) Validate only on export — rejected: violates FR-008 "stored as". (c) Full OKF taxonomy/registry — rejected: OKF leaves `type` producer-defined; spec assumption records this.

## D6: Link pages — `pages.kind` + `link_target_page_id`, resolve-at-render, no content copies

**Decision**:

- `pages` gains `kind` (`page_kind` enum: `native | link`, default `native`) and `link_target_page_id` (uuid, nullable, app-enforced FK to `pages.id`, index). Constraint: `kind='link'` ⇒ `link_target_page_id NOT NULL`; target must live in the generated space and must not itself be a link (no chains).
- A link page **has revisions** (P8): creating/retargeting a link page writes a revision whose `content_source` is `NULL` and whose metadata records the target (the revision documents the retarget event; `content_html` empty). Draft/publish model is bypassed: link pages are live on creation, like raw entries.
- **Render**: `pages.getLive` (and cached variants) detects `kind='link'`, loads the target page's current published revision, and returns that content with the link page's own path/title. If the target is deleted/unpublished → the link path 404s gracefully (edge case in spec).
- **Tree/sitemap/navigation**: link pages appear in the wiki tree with a `kind` marker; sitemap includes link paths.
- **Backlinks**: target's backlink view includes link pages referencing it (uses existing link index or the new FK — implementation detail for tasks).

**Rationale**: A first-class `kind` keeps the page tree uniform (permissions, paths, soft-delete all reuse) while the FK makes fan-out invalidation and target lookups trivial. Revision-per-retarget preserves the audit trail of what was published where, when.

**Alternatives considered**: (a) Link as a frontmatter directive on an otherwise native page — rejected: invisible to queries, no fan-out, no tree marker. (b) Content-copy with sync-on-publish — rejected: violates the spec's core "no duplication" requirement. (c) Link chains allowed — rejected: ambiguity in resolution and invalidation, near-zero value.

## D7: Provenance — `page_revisions.actor_kind`, `pages.nature`, derived `humanModified`

**Decision**:

- `page_revisions.actor_kind` (`actor_kind` enum: `human | machine`, NOT NULL default `human`; existing rows backfill `human`). Set at write time from the credential (clarification Q2): session actor → `human`; api_key actor or internal pipeline write → `machine`. Internal services (translation-writer, future AI curation) pass `machine` explicitly.
- `pages.nature` (`content_nature` enum: `original | generated`, NOT NULL default `original`; existing rows backfill `original`). Set at creation: explicit writer declaration wins; default = `machine` actor → `generated`, `human` actor → `original`. MCP/API create accepts an optional `nature` param.
- `humanModified` (derived, not stored): page has any revision with `actor_kind='human'` — computed in the page resource builder via a cheap `EXISTS` subquery; exposed on page resources (FR-010, FR-016).
- API/audit: `api_audit_entries` already records `origin` (`web|api|feishu`) + `key_id`; combined with `actor_kind` on revisions, FR-010 is satisfied without a new audit table. The API page/revision resources expose `origin: { actorKind, nature }` (FR-017).

**Rationale**: Revision-level `actor_kind` is the finest truthful grain and directly powers "ever human-modified"; page-level `nature` is creation-time classification, stable for filtering. No new audit infrastructure — the existing request-level audit plus revision provenance covers the requirement.

**Alternatives considered**: (a) New domain audit table — rejected: duplicates what revisions + api_audit_entries already tell. (b) `nature` per revision — rejected: nature classifies the page's origin, not each save; per-page is simpler and sufficient for filtering. (c) Writer-declared actor kind — rejected in clarification Q2 (spoofable).

## D8: Search & retrieval — space-kind-aware projection; vector scope unchanged

**Decision**:

- Lexical engines (tsvector, pg_trgm) and the legacy ILIKE path become space-parameterized (they already take `spaceId`; wire them to the resolver instead of `getDefaultSpaceId`).
- `candidate-projection.ts` enforces per-space visibility: wiki → existing `anonymousRead` logic; raw/generated → admin-only (and mode check). Search/MCP callers get raw/generated hits only when permitted (FR-019, SC-009).
- Generated-space filtering by OKF `type`/`tags` reuses the existing frontmatter filter channel (`filterStatus`/`filterOwner` pattern in `listPages`/`searchPages`) with a new `filterType` key.
- `ai_knowledge_chunks` / vector retrieval: unchanged in this feature (no `spaceId` on chunks today); semantic search remains wiki-scoped. Recorded as a known limitation for a later AI-retrieval feature.

**Rationale**: Minimal change to the search architecture mandate (engines stay replaceable behind the coordinator); permission safety stays in exactly one place (projection).

**Alternatives considered**: (a) Add `spaceId` to chunks + re-index — rejected for this feature: large migration + re-embedding cost, and the AI curation feature (010) is the right home. (b) Exclude raw/generated from search indexes — rejected: FR-019 requires MCP search over them.

## D9: Permissions — space-kind rules inside `can()` + per-page `visibility` for migration

**Decision**:

- Extend `can()` (`permissions/index.ts`) so page-list/page resources accept a `spaceKind` input alongside `anonymousRead`:
  - `kind='raw'`: `read`/`create` → admin role (or api_key with proper scope + admin user); `edit`/`delete`/`publish` → **denied for all** (append path bypasses `edit` by design — it is its own action guarded in the service).
  - `kind='generated'`: `read`/`create`/`edit`/`publish`/`delete` → admin role only by default.
  - `kind='wiki'`: unchanged.
  - In Copilot mode, raw/generated resources are denied regardless (mode guard).
- `pages.visibility` (`page_visibility` enum: `public | restricted`, default `public`): `restricted` pages are readable/editable by admin role only, in any space. Used by the switch-back migration to honor the clarified per-source-space visibility choice (public vs owner-only); also useful for private pages generally. `can()` `read`/`edit` check `visibility` when acting on a concrete page.

**Rationale**: Keeps one chokepoint (P5); `visibility` is the smallest honest implementation of the clarified migration choice given the product has no per-user ACL tables.

**Alternatives considered**: (a) Full per-page/per-user ACL tables — rejected: constitution scope creep for one requirement. (b) Owner-only = move pages to a separate archive space on switch-back — rejected: violates FR-022 "into the wiki space as regular pages". (c) New roles — rejected: role matrix churn; admin maps to owner in the personal-default product.

## D10: Mode switching — pg-boss `writing-mode-switch` job

**Decision**:

- New queue `writing-mode-switch` registered explicitly in `jobs/register.ts` (P7, P10), handler `jobs/writing-mode-switch.ts`.
- **Copilot → LLM Wiki**: synchronous setting flip (spaces already seeded, D1); no job needed beyond cache invalidation.
- **LLM Wiki → Copilot**: `switchMode('copilot', { rawVisibility, generatedVisibility })` validates + flips nothing yet; enqueues a job that:
  1. For every raw-space page (path order), creates a native wiki-space page at `raw/<original path>` (path-conflict → suffix `-2`, `-3`, …), copying all revisions with original `version_number`, `author_id`, `actor_kind`, `nature`, `created_at`; sets `visibility = rawVisibility` (`public` ↔ `restricted`).
  2. Same for generated pages → `generated/<original path>` with `visibility = generatedVisibility`.
  3. For every wiki link page: materializes a native page with the target's then-current published content (FR-023), then soft-deletes the link page row.
  4. Flips the setting to `copilot`, invalidates all public caches.
  5. Writes progress into the job record; UI polls job status (existing job-status pattern).
- Job is idempotent per page (skips already-migrated canonical paths) so retry after failure is safe; failure leaves the deployment in LLM Wiki mode (setting flips last).

**Rationale**: Flip-last ordering means a crash never strands the instance in Copilot mode with unmigrated content; idempotent page migration makes retry trivial.

**Alternatives considered**: (a) Synchronous migration in the request — rejected: P7 (>500ms). (b) Move rows instead of copy — rejected: page ids must stay stable for revisions; rewriting `space_id`+`path` in place breaks canonical uniqueness bookkeeping and external references; copy-then-soft-delete-source preserves history cleanly. Soft-deleted source pages remain as tombstones in raw/generated spaces (harmless, inaccessible in copilot mode).

## D11: API surface — `space` query param, append sub-resource, origin/kind fields

**Decision** (details in `contracts/v1-api-delta.md`):

- Read/list endpoints (`GET /v1/pages`, `/v1/tree`, `/v1/search/pages`, `GET /v1/pages/[id]`, revisions, backlinks, stats) accept optional `space` (slug, default `default`) and enforce mode + space-kind permissions.
- `POST /v1/pages` accepts `space`; in LLM Wiki mode, when the caller is an api_key (MCP) and `space` is omitted → default becomes `generated` (FR-018); session UI callers keep `default`. `POST /v1/pages` with `space=raw` creates a raw entry (body carries `inputKind` + `source` metadata + initial content).
- New sub-resource `POST /v1/pages/[id]/appends` (raw entries only): body `{ content, source? }`; rejects non-raw pages.
- Page/revision resources gain: `kind`, `linkTargetPageId` (+ resolved target path/title when present), `origin: { actorKind, nature }`, `humanModified`; revision resources gain `origin.actorKind`. `spaceSlug` already exists.
- Settings: `GET|PUT /api/settings/writing-mode` (admin; PUT accepts `{ mode, rawVisibility?, generatedVisibility? }`, returns `{ mode }` or `{ jobId }` for switch-back). Setup: `PUT /api/setup/writing-mode` records the onboarding choice.
- OpenAPI: regenerate `public/openapi.json` via `next-openapi-gen` (AGENTS.md rule: update docs via next-open-api on API changes).

**Alternatives considered**: (a) New parallel `/v1/raw/*` route tree — rejected: P11 unified entry points; space is a parameter of the same resources. (b) Verb route `/pages/[id]/append` POST is a sub-resource (`appends`) — kept RESTful (noun, POST creates an append event).

## D12: MCP surface — space params on existing tools + `append_raw_entry`

**Decision** (details in `contracts/mcp-tools-delta.md`):

- Add optional `space` to `list_pages`, `get_page_tree`, `get_page`, `search_wiki`, `list_revisions`, `get_revision`, `get_backlinks`, `get_stats`.
- `create_page`: optional `space`; server-side default per D11 (generated in LLM Wiki mode for key callers).
- `search_wiki`/`list_pages`: add `filterType` (OKF frontmatter `type`) alongside existing `filterTag`/`filterStatus`/`filterOwner`; raw filtering uses `filterType=chat-transcript|external-fetch|script-run|manual-note` (raw input kinds are stored as the OKF `type` — one filter channel, D4).
- New tool `append_raw_entry(pageId, content, source?)` → `POST /v1/pages/[id]/appends`.
- `save_draft`/`update_page_properties`/`delete_page` against raw pages return the API's 403 (tool surfaces the error).

**Rationale**: FR-019/FR-020 met with minimal new surface; one filter channel for both OKF types and raw input kinds keeps the agent-facing model simple.

**Alternatives considered**: Separate `list_raw_entries`/`search_raw` tools — rejected: duplicated surface; space param is strictly simpler for agents.

## D13: Frontend — Navigator space switcher, authenticated `/spaces/[space]` routes, onboarding step, admin page

**Decision**:

- **Routes**: raw/generated browsing lives at `/spaces/[space]/[...path]` (new authenticated `(user)`-group route; admin-gated), reusing the reader components with a space context; wiki stays at `[...path]` (public ISR). Editor routes (`/new`, `/edit/[...path]`) accept a space context param and post to v1 with `space`.
- **Navigator**: when mode = llm-wiki AND actor is admin, the sidebar header renders a space switcher (wiki / generated / raw) linking to the three roots; selection is URL-derived (P11). Anonymous and non-admin users never see it (P12: outside cached body — the switcher is part of the authenticated shell, not the ISR document).
- **Link affordances**: page view shows a "linked from generated" badge (authenticated only) with target link; generated pages show a human-modified indicator (FR-016) from the `humanModified` field; a "Publish as link…" action on generated pages opens a dialog choosing the wiki path.
- **Onboarding**: `setupStepSchema` gains `writing_mode`; `STEP_ORDER = ['account','ai','writing_mode','sample_pages','summary']`; new `WritingModeStep` (radio cards: Copilot recommended/default, LLM Wiki) calling `PUT /api/setup/writing-mode`; `setup.ts` transitions updated.
- **Admin**: `/admin/writing-mode` page (nav entry under Admin) showing current mode + switch action; switching back opens a **modal dialog** (no browser alerts — project UI rule) with the migration warning and two independent visibility selects (raw → public/owner-only, generated → public/owner-only), then PUTs and polls job status.
- i18n: all strings added to `locales/en.ts` + `zh.ts`.

**Rationale**: URL-first space routing satisfies P11 without touching the public ISR shell; modal dialog follows the project's no-browser-alert rule.

**Alternatives considered**: (a) Query-param-only switching (`?space=`) on the public route — rejected: would poison the ISR cache key space and mix admin surfaces into the static shell. (b) Separate admin-only tree page without reader rendering — rejected: owner needs to *read* raw/generated content properly, not just administer rows.

---

## Resolved requirement mapping (spot check)

| Spec requirement | Decisions |
|---|---|
| FR-001/002/003 mode setting + onboarding + copilot parity | D3, D13 |
| FR-004–007 raw space | D1, D4, D9 |
| FR-008 OKF generated space | D5 |
| FR-009 generated permissions / FR-010 audit distinction | D7, D9 |
| FR-011–014 link pages + public reach | D6, D11 |
| FR-015/016 navigation & indicators | D13 |
| FR-017–020 API/MCP origin + raw/generated support | D7, D11, D12 |
| FR-021–023 mode switching + migration + link materialization | D10, D9 |
| SC-001–009 | verified via quickstart.md scenarios |
