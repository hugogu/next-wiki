# Phase 1 Data Model: Skill System & Provider-Agnostic Tool Calling

All schema changes go through `pnpm db:generate` against
`apps/web/src/server/db/schema/*.ts`. No hand-authored SQL, no hand-edited
`meta/_journal.json` (see the project CLAUDE.md rule and the drift it documents).

---

## New enums (`db/schema/enums.ts`)

| Enum | Values | Notes |
|---|---|---|
| `skill_source` | `builtin`, `directory`, `managed` | Derived at read time for directory skills; persisted on `skills` rows only as `builtin` (override) or `managed`. |
| `skill_validation_state` | `valid`, `invalid` | `invalid` skills are never offered to the model. |
| `skill_file_kind` | `instruction`, `reference`, `script` | Derived from path on load; stored on persisted files for display. |
| `tool_call_strategy` | `auto`, `native`, `text` | Administrator override for FR-003. |

---

## `skills`

Rows exist **only** for admin-authored skills and for overrides of built-in
skills. Directory skills deliberately have no row (R7) — that is what makes
"remove it from the host and it disappears after a rescan" true.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default random |
| `name` | text | **unique**, `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars |
| `source` | `skill_source` | `managed` or `builtin`; `directory` is never persisted |
| `description` | text | 1–1024 chars; mirrored from `SKILL.md` frontmatter on save |
| `validation_state` | `skill_validation_state` | not null, default `valid` |
| `validation_error` | text | nullable; specific reason when `invalid` (FR-046) |
| `deleted_at` | timestamptz | nullable — soft delete (P8) |
| `created_by` | uuid | FK `users.id` on delete set null |
| `created_at` / `updated_at` | timestamptz | not null, default now |

**Indexes**: unique on `name` where `deleted_at is null`; index on `source`.

**Validation rules**
- FR-014/FR-016: creating or renaming a `managed` skill fails when the name is
  taken by *any* registry entry — built-in, directory, or another managed row.
  The unique index is the backstop; the registry check produces the useful
  message naming the conflicting source.
- FR-033: a save that would leave `SKILL.md` without a valid `name` or
  `description` is rejected and the previous content stays in effect.
- A `builtin`-source row may only exist for a name present in
  `BUILTIN_SKILL_PACKAGES`; deleting the row is exactly the "reset to shipped
  default" of FR-034.

---

## `skill_files`

Current content of every file in a persisted skill.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `skill_id` | uuid | FK `skills.id` on delete cascade |
| `path` | text | relative to the package root; no `.`/`..` segment, no leading `/`, ≤255 chars |
| `kind` | `skill_file_kind` | not null |
| `content` | text | ≤64 KiB (R6) |
| `content_type` | text | e.g. `text/markdown`, `text/x-shellscript` |
| `byte_size` | integer | not null |
| `revision` | integer | not null, starts at 1, incremented per save — the optimistic-concurrency token for FR-036 |
| `updated_by` | uuid | FK `users.id` on delete set null |
| `updated_at` | timestamptz | not null, default now |

**Indexes**: unique on `(skill_id, path)`.

**Validation rules**
- FR-029: `path` is validated before any filesystem or storage access; a path
  that normalises outside the package root is rejected.
- FR-037: files above the size limit or detected as binary are never stored
  through the editor; directory-sourced ones are listed with name/type/size and
  marked non-viewable.
- FR-036: a write carries the `revision` the client read. A mismatch returns a
  conflict; the write is not applied.

---

## `skill_file_revisions`

Immutable per-save history (P8, FR-032).

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `skill_id` | uuid | FK `skills.id` on delete cascade |
| `path` | text | not null — recorded even if the file is later deleted |
| `revision` | integer | not null |
| `content` | text | not null — the content as of this save |
| `operation` | text | `create` \| `update` \| `delete` \| `rename` |
| `created_by` | uuid | FK `users.id` on delete set null |
| `created_at` | timestamptz | not null, default now |

**Indexes**: unique on `(skill_id, path, revision)`; index on
`(skill_id, created_at desc)`.

Rows are never updated or deleted by normal operations.

---

## `skill_settings`

Keyed by skill **name**, not by row id, so state survives a directory skill
temporarily disappearing from the mount (R7).

| Column | Type | Constraints |
|---|---|---|
| `name` | text | PK |
| `enabled` | boolean | not null |
| `last_used_at` | timestamptz | nullable (FR-045) |
| `updated_by` | uuid | FK `users.id` on delete set null |
| `updated_at` | timestamptz | not null, default now |

Effective enabled state = `skill_settings.enabled` when a row exists, otherwise
the source default: `true` for all three sources (FR-044, R8). A row is written
only when an Administrator changes the state, so defaults stay changeable in code
without a data migration.

---

## `ai_models` (extended)

| Column | Type | Notes |
|---|---|---|
| `tool_call_strategy` | `tool_call_strategy` | not null, default `auto` (FR-003) |
| `native_tool_call_failed_at` | timestamptz | nullable runtime downgrade marker; cleared when `tool_call_strategy` is changed or the model is re-synced |

The existing `ai_model_capabilities` rows for `tool_calling` are unchanged and
keep their current meaning — *whether* a model may drive the loop at all. The new
columns govern only *how* (R4).

---

## Registry entity (in-memory, not persisted)

`SkillRegistryEntry` is the unified view assembled by
`server/services/skills/registry.ts` from all three sources:

```text
{
  name, description, source, editable, validationState, validationError,
  files: [{ path, kind, contentType, byteSize, viewable }],
  origin: { directory?: string, packageId?: string },
  enabled, lastUsedAt,
}
```

Plus a parallel list of entries that were **rejected**:

```text
{ name?, origin, reason: 'missing_instruction_file' | 'invalid_frontmatter'
        | 'duplicate_name' | 'too_large' | 'too_many_files'
        | 'path_escape' | 'unreadable',
  detail, conflictsWith? }
```

Rejected entries are surfaced to Administrators (FR-015, FR-025, FR-046) and are
never offered to the model.

### Registration order (FR-014, spec assumption)

1. Built-in packages, in the fixed order of `BUILTIN_SKILL_PACKAGES`, each
   overlaid with its `builtin` override row if present.
2. Admin-authored (`managed`) rows, ordered by `created_at`.
3. Directory packages, ordered by directory name.

The first registration of a name wins; every later claimant becomes a
`duplicate_name` rejection naming the winner's source. This is deterministic and
is what makes FR-015 and SC-010 testable.

---

## State transitions

**Skill validation**

```text
(load or save) --valid--> valid --(save that breaks frontmatter)--> rejected, previous content retained
              \--invalid--> invalid (listed, never offered to the model)
```

**Directory skill lifecycle**

```text
absent --scan finds valid package--> registered
registered --scan no longer finds it--> absent (settings row by name survives)
registered --name already taken--> rejected(duplicate_name)
rejected --operator renames on host, rescan--> registered   (FR-027, spec edge case)
```

**Built-in skill override**

```text
shipped --admin edits a file--> overridden (skills row + skill_files)
overridden --admin resets--> shipped (row soft-deleted, revisions retained)
```

**Tool-call strategy per model**

```text
auto --adapter has no native tools--> text
auto --native rejected at runtime--> text, native_tool_call_failed_at set
text/native --admin sets strategy--> that strategy, marker cleared
```

---

## Relationship to existing entities

- **`ai_tool_calls`** (026): unchanged. A `load_skill` call is an ordinary row —
  this is how FR-024 ("which skills were loaded, visible on the resulting durable
  change") is satisfied without a new table. `last_used_at` on `skill_settings`
  is a denormalised convenience for FR-045, not the source of truth.
- **`ai_tool_proposals`** (026): unchanged. Wiki Tagger and Wiki Linker produce
  proposals through the existing executors.
- **`pages` / `page_revisions`** (P8): unchanged. Wiki Writer produces ordinary
  drafts. No skill-specific content table exists, which is what keeps the
  "AI content as second-class" anti-pattern out.

---

## Migration notes

- One `pnpm db:generate` run covering: four new enums, four new tables, two new
  `ai_models` columns.
- Backfill: none. Absent `skill_settings` rows resolve to the source default, and
  `ai_models.tool_call_strategy` defaults to `auto`, so existing installations
  behave exactly as before until an admin changes something (SC-002).
- After generating, run `pnpm db:generate` a second time with no further edits and
  confirm `No schema changes, nothing to migrate`.
