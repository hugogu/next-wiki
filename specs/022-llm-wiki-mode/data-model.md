# Data Model: Wiki Writing Modes — Copilot and LLM Wiki

**Date**: 2026-07-18 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

All changes are produced by editing `apps/web/src/server/db/schema/{enums.ts,index.ts}` and running `pnpm db:generate` (never hand-authored SQL — AGENTS.md rule). The foundational changes are recorded in the generated `0022_*`, `0023_*`, and `0024_*` migrations.

## New enums (`enums.ts`)

| Enum | Values | Used by |
|---|---|---|
| `writing_mode` | `copilot`, `llm-wiki` | `writing_mode_settings.mode` |
| `space_kind` | `wiki`, `raw`, `generated` | `spaces.kind` |
| `page_kind` | `native`, `link` | `pages.kind` |
| `actor_kind` | `human`, `machine` | `page_revisions.actor_kind` |
| `content_nature` | `original`, `generated` | `pages.nature` |
| `page_visibility` | `public`, `restricted` | `pages.visibility` |
| `raw_input_kind` | `chat-transcript`, `external-fetch`, `script-run`, `manual-note` | `page_revisions.source_metadata.inputKind` (stored as JSONB enum value, not a DB-level enum) — documented here for contract clarity |

The existing `content_type` enum used by `page_revisions.content_type` is **broadened from a single `text/markdown` value to an open content-type string** (no longer a closed enum). Wiki and generated pages keep defaulting to `text/markdown`; raw entries use the original source format (`text/plain`, `text/html`, `application/json`, `application/pdf`, `text/x-log`, `image/*`, etc.). The column type changes from enum to `text` with `CHECK (content_type IS NOT NULL)` only — no value-list constraint — so previously stored `text/markdown` rows remain valid.

## Table deltas

### `spaces` (extend)

| Column | Type | Default | Notes |
|---|---|---|---|
| `kind` | `space_kind` NOT NULL | `'wiki'` | Existing `default` row backfills `wiki` |

Seed changes (`src/server/seed/index.ts`): idempotently ensure three spaces — `default` (wiki, `anonymous_read` unchanged), `raw` (kind raw, `anonymous_read=false`), `generated` (kind generated, `anonymous_read=false`) — in **both** modes.

### `pages` (extend)

| Column | Type | Default | Notes |
|---|---|---|---|
| `kind` | `page_kind` NOT NULL | `'native'` | `link` ⇒ softlink page |
| `link_target_page_id` | uuid NULL | — | Set iff `kind='link'`; app-enforced reference to `pages.id`; target must be generated-space, non-link, non-deleted. Index added |
| `nature` | `content_nature` NOT NULL | `'original'` | Stable creation-time classification; raw is forced `original`, link is forced `generated`; existing rows backfill `original` |
| `visibility` | `page_visibility` NOT NULL | `'public'` | `restricted` = admin-only read/edit in any space |
| `raw_category_id` | uuid NULL FK → `raw_categories.id` ON DELETE RESTRICT | — | Raw entries only; immutable after creation. NULL for non-raw pages. Constrained NOT NULL at the service layer on raw create |

Invariants (service-enforced, documented in `link-pages.ts` and `raw-entries.ts`):
- `kind='link'` ⇔ `link_target_page_id IS NOT NULL`; no link chains (target `kind='native'`).
- Link pages exist only in `wiki`-kind spaces; raw entries only in `raw`; OKF validation only in `generated`.
- `space.kind='raw'` ⇒ `raw_category_id IS NOT NULL` (except where the admin-configured default is applied silently at create time, in which case it is still NOT NULL after the create).
- Canonical uniqueness `(space_id, path, locale)` unchanged — a link page and a native page may not share a path.

### `page_revisions` (extend)

| Column | Type | Default | Notes |
|---|---|---|---|
| `actor_kind` | `actor_kind` NOT NULL | `'human'` | Derived from credential at write (session=human; api_key/pipeline=machine); existing rows backfill `human` |
| `source_metadata` | jsonb NULL | — | Immutable source metadata for a raw create/append chunk; null for non-raw revisions. Stores `inputKind` (`chat-transcript`/`external-fetch`/`script-run`/`manual-note`), `channel`, `url`, `sessionId`, `command`, `occurredAt`. NOT injected into the body |
| `original_asset_id` | uuid NULL FK → `content_assets.id` ON DELETE RESTRICT | — | Raw-only immutable reference to the original-bytes asset (PDF, HTML, JSON, image, raw log). Null for wiki/generated pages and for raw revisions without an original-byte payload. The asset row is created before the revision and never modified |
| `link_target_page_id` | uuid NULL | — | Immutable target for a link create/retarget/materialization revision; app-enforced reference to `pages.id` |

`content_source` remains nullable — link-page revisions store `NULL` source (retarget event records); `content_html` empty for those. For raw revisions, `content_source` holds the **extracted text** (format indicated by `content_type`), and is the default surface for search and AI retrieval. The original bytes live in the `content_assets` row referenced by `original_asset_id` and are the default surface for verbatim viewing/download. `content_type` for raw revisions is no longer constrained to `text/markdown` — see the enum broadening note above.

### `writing_mode_settings` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK default `'default'` | Enforced singleton: `CHECK (id = 'default')` (pattern from `setup_progress`) |
| `mode` | `writing_mode` NOT NULL default `'copilot'` | |
| `pending_mode` | `writing_mode` NULL | Non-null while an async switch is pending/running |
| `switch_job_id` | uuid NULL | pg-boss job id for the pending switch |
| `updated_by` | uuid NULL FK → `users.id` ON DELETE SET NULL | |
| `updated_at` | timestamptz NOT NULL default now() | |

CHECK: `(pending_mode IS NULL) = (switch_job_id IS NULL)`.

### `raw_categories` (new)

Admin-managed taxonomy used to file raw entries for retrieval and AI curation (FR-007c). Available in `llm-wiki` mode only; the table is seeded empty and Admins populate it.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | |
| `name` | text NOT NULL | Display name |
| `slug` | text NOT NULL | URL/filter-safe identifier; `UNIQUE(name)` and `UNIQUE(slug)` |
| `description` | text NULL | Optional longer description |
| `is_default` | boolean NOT NULL default `false` | At most one row may have `is_default=true` (enforced by partial unique index); when set, raw creates without explicit `categoryId` silently assign this category |
| `is_retired` | boolean NOT NULL default `false` | Retired categories are not selectable for new entries; existing assignments are preserved (immutable). Retire replaces delete when entries are still assigned |
| `entry_count` | derived | `COUNT(pages.id) WHERE pages.raw_category_id = raw_categories.id AND pages.space.kind='raw' AND NOT pages.deleted_at` — computed for listing; not stored |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | |
| `updated_by` | uuid NULL FK → `users.id` ON DELETE SET NULL | |

Indexes: `UNIQUE(slug)`, `UNIQUE(name)`, partial `UNIQUE INDEX (is_default) WHERE is_default = true`, and `UNIQUE INDEX (is_retired, slug)` is NOT required (slug already unique). Backfill on existing deployments: empty table; existing raw entries that pre-date the taxonomy are migrated with the first admin-created category marked `is_default=true`.

## Derived / non-stored

- **`humanModified`** (page): `EXISTS (SELECT 1 FROM page_revisions WHERE page_id = pages.id AND actor_kind = 'human')`; computed in resource builders, exposed via API (FR-010).
- **Page `origin.actorKind`**: actor kind of the page's version-1 revision.
- **Revision `origin.nature`**: joined from `pages.nature`; nature remains page-level and stable while actor kind remains revision-level.
- **Space of a revision**: via `page_id` join (no column, unchanged).

## Entity relationships

```text
writing_mode_settings (singleton)  — governs guard behavior across services
spaces 1───n pages
pages  1───n page_revisions
pages  0..1 ──link_target_page_id──▶ pages (generated-space native page)
pages  0..1 ──raw_category_id──▶ raw_categories (raw entries only)
page_revisions  0..1 ──original_asset_id──▶ content_assets (raw original bytes)
page_revisions  0..1 ──link_target_page_id──▶ pages — historical link target
page_revisions.source_metadata — raw input kind + channel/url/session/command/occurredAt
pages.nature / page_revisions.actor_kind — provenance
```

## Validation rules (from requirements)

| Rule | Enforcement point |
|---|---|
| Generated-space normalized path leaf must not be reserved `index`/`log`; source must parse as YAML frontmatter with non-empty `type`; missing block ⇒ inject `{type: Note, title, timestamp}`; invalid block ⇒ reject | `services/okf.ts` invoked from `pages.create`/`pages.newDraft` and path-changing `pages.updateProperties` when space kind = generated. **The OKF hook fires ONLY for generated-space pages; raw and wiki pages bypass it entirely.** |
| Raw: create/append only; no edit/delete/unpublish/path-rename for any actor | `can()` space-kind deny + guards in `pages.ts`/`raw-entries.ts`; append = server-side concatenation in one transaction respecting `contentType` |
| Raw entry body MUST preserve original source format byte-identical; no OKF frontmatter, no markdown conversion, no semantic rewriting; `inputKind`/`source` live in `source_metadata` only | `services/raw-entries.ts` write path; rejects any caller-supplied frontmatter injection and skips the OKF hook entirely for raw |
| Raw entry original bytes MUST be stored through `content_assets` and referenced immutably via `original_asset_id`; declared `contentType` MUST match the actual bytes (content sniffing) | `services/raw-entries.ts` + `services/content-store/*`; reject with `RAW_CONTENT_TYPE_MISMATCH` on disagreement |
| Raw entry `raw_category_id` MUST be assigned at create (or via admin-configured default); immutable thereafter | `services/raw-entries.ts` create path + `pages.updateProperties` reject for raw |
| Raw categories: at most one `is_default=true`; cannot delete while entries reference (retire instead); slug and name unique | `services/raw-categories.ts` + table partial unique index |
| Link target must be a live generated-space native page; no self-links, no chains | `link-pages.ts` create/retarget |
| `visibility` transition only `public ↔ restricted` by admin (or migration job) | `pages.updateProperties`-level guard |
| Raw nature is `original`; link nature is `generated`; other page nature is immutable after creation; `actor_kind`, `source_metadata`, `original_asset_id`, and revision link target are immutable | Creation services + no revision update paths |
| `kind='link'` iff page target is non-null | Database CHECK plus link-page service validation |
| Every content mutation takes the mode-row `FOR SHARE` lock first and requires `pending_mode IS NULL`; migration takes the conflicting row lock before page locks | `writing-mode.ts` transaction helpers used by all page/revision/link/raw writes |
| Mode value one of enum; switch-back requires visibility choices; pending mode/job fields change together | `writing-mode.ts.switchMode` input schema + table CHECK |

## State transitions

### Writing mode

```text
copilot ──switch (sync, spaces pre-seeded)──▶ llm-wiki
llm-wiki ──confirm──▶ pending_mode=copilot (content writes blocked)
                         │
                         ├── job transaction commits ──▶ mode=copilot, pending cleared
                         └── terminal failure/rollback ─▶ mode=llm-wiki, pending cleared
```

### Raw entry

```text
[create + auto-publish] → [append + auto-publish]* → (terminal — no edit, no delete, no unpublish)
  body: extracted text (content_source) + optional original bytes (content_assets via original_asset_id)
  contentType: open string; not OKF-validated; not markdown-converted
  source_metadata: inputKind + channel/url/session/command/occurredAt — immutable per revision
  raw_category_id: set at create (or admin-default); immutable thereafter
```

### Link page

```text
[create (live immediately)] → [retarget]* → [soft-delete]      (target lifecycle independent)
target unpublished/deleted ⇒ link path 404s gracefully until retarget or link deletion
switch-back + published target ⇒ same page becomes native with a materialization revision
switch-back + no published target ⇒ soft-delete
```

### Generated page

Normal draft → publish flow (unchanged); provenance fields set at creation/save and immutable thereafter.
