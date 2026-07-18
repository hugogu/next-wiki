# Data Model: Wiki Writing Modes — Copilot and LLM Wiki

**Date**: 2026-07-18 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

All changes are produced by editing `apps/web/src/server/db/schema/{enums.ts,index.ts}` and running `pnpm db:generate` (never hand-authored SQL — AGENTS.md rule). One migration (`0022_*`) covers everything below.

## New enums (`enums.ts`)

| Enum | Values | Used by |
|---|---|---|
| `writing_mode` | `copilot`, `llm-wiki` | `writing_mode_settings.mode` |
| `space_kind` | `wiki`, `raw`, `generated` | `spaces.kind` |
| `page_kind` | `native`, `link` | `pages.kind` |
| `actor_kind` | `human`, `machine` | `page_revisions.actor_kind` |
| `content_nature` | `original`, `generated` | `pages.nature` |
| `page_visibility` | `public`, `restricted` | `pages.visibility` |

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
| `link_target_page_id` | uuid NULL | — | Set iff `kind='link'`; app-enforced FK to `pages.id`; target must be generated-space, non-link, non-deleted. Index added |
| `nature` | `content_nature` NOT NULL | `'original'` | Creation-time classification; existing rows backfill `original` |
| `visibility` | `page_visibility` NOT NULL | `'public'` | `restricted` = admin-only read/edit in any space |

Invariants (service-enforced, documented in `link-pages.ts`):
- `kind='link'` ⇔ `link_target_page_id IS NOT NULL`; no link chains (target `kind='native'`).
- Link pages exist only in `wiki`-kind spaces; raw entries only in `raw`; OKF validation only in `generated`.
- Canonical uniqueness `(space_id, path, locale)` unchanged — a link page and a native page may not share a path.

### `page_revisions` (extend)

| Column | Type | Default | Notes |
|---|---|---|---|
| `actor_kind` | `actor_kind` NOT NULL | `'human'` | Derived from credential at write (session=human; api_key/pipeline=machine); existing rows backfill `human` |

`content_source` remains nullable — link-page revisions store `NULL` source (retarget event records); `content_html` empty for those.

### `writing_mode_settings` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK default `'default'` | Enforced singleton: `CHECK (id = 'default')` (pattern from `setup_progress`) |
| `mode` | `writing_mode` NOT NULL default `'copilot'` | |
| `updated_by` | uuid NULL FK → `users.id` ON DELETE SET NULL | |
| `updated_at` | timestamptz NOT NULL default now() | |

## Derived / non-stored

- **`humanModified`** (page): `EXISTS (SELECT 1 FROM page_revisions WHERE page_id = pages.id AND actor_kind = 'human')`; computed in resource builders, exposed via API (FR-010).
- **Space of a revision**: via `page_id` join (no column, unchanged).

## Entity relationships

```text
writing_mode_settings (singleton)  — governs guard behavior across services
spaces 1───n pages
pages  1───n page_revisions
pages  0..1 ──link_target_page_id──▶ pages (generated-space native page)
pages.nature / page_revisions.actor_kind — provenance (no FKs)
```

## Validation rules (from requirements)

| Rule | Enforcement point |
|---|---|
| Generated-space page source must parse as YAML frontmatter with non-empty `type`; missing block ⇒ inject `{type: Note, title, timestamp}`; invalid block ⇒ reject | `services/okf.ts` invoked from `pages.create`/`pages.newDraft` when space kind = generated |
| Raw: create/append only; no edit/delete/unpublish/path-rename for any actor | `can()` space-kind deny + guards in `pages.ts`/`raw-entries.ts`; append = server-side concatenation in one transaction |
| Link target must be a live generated-space native page; no self-links, no chains | `link-pages.ts` create/retarget |
| `visibility` transition only `public ↔ restricted` by admin (or migration job) | `pages.updateProperties`-level guard |
| `nature` immutable after creation; `actor_kind` immutable per revision | No update paths exist |
| Mode value one of enum; switch-back requires `rawVisibility` + `generatedVisibility` decisions | `writing-mode.ts.switchMode` input schema |

## State transitions

### Writing mode

```text
copilot ──switch (sync, spaces pre-seeded)──▶ llm-wiki
llm-wiki ──switch (confirm + visibility choices + job)──▶ copilot
                 job: pending → running → completed | failed (mode flips last; failed ⇒ stays llm-wiki)
```

### Raw entry

```text
[create + auto-publish] → [append + auto-publish]* → (terminal — no edit, no delete, no unpublish)
```

### Link page

```text
[create (live immediately)] → [retarget]* → [soft-delete]      (target lifecycle independent)
target unpublished/deleted ⇒ link path 404s gracefully until retarget or link deletion
```

### Generated page

Normal draft → publish flow (unchanged); provenance fields set at creation/save and immutable thereafter.
