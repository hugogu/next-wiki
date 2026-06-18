# Data Model: Core Wiki Platform

**Feature**: `001-core-wiki-platform`
**Date**: 2026-06-14
**ORM**: Drizzle (PostgreSQL 16+). All schemas live in `apps/web/src/server/db/schema/`.
Migrations are idempotent and versioned under `db/migrations/`.

This model implements every relevant invariant in the constitution
(`docs/architecture/mandates.md`) and the spec's clarifications (A1–A12). Fields
marked **[hidden]** are persisted for forward-compatibility but not exposed in
this slice's UI.

---

## Enums

```ts
userRole        = 'admin' | 'editor' | 'reader'   // built-in roles (spec FR-015)
userStatus      = 'active' | 'disabled'
revisionStatus  = 'draft' | 'published'            // version-level publish (D4, A1)
contentType     = 'text/markdown'                  // default editor format (extensible)
```

Roles are modeled as a built-in enum (the constitution's "baseline permission
groups"). Per-page permission *entries* are deferred (spec A7); the
`can(actor, action, resource)` chokepoint is the single place this enum is
interpreted (D3).

---

## Entity: `users`

A registered account. Owned by this slice's auth + admin features.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid (pk) | default `gen_random_uuid()` | surrogate PK |
| `email` | citext | unique not null | login identity; case-insensitive |
| `password_hash` | text | not null | bcrypt hashed (argon2-compatible cost factor) |
| `role` | userRole | not null default `'reader'` | default role on registration (FR-003) |
| `status` | userStatus | not null default `'active'` | admin can disable |
| `must_reset_password` | boolean | not null default `false` | set on admin reset; forces change on next login (D9) |
| `display_name` | text | nullable | UI display |
| `created_at` | timestamptz | not null default `now()` | |
| `updated_at` | timestamptz | not null default `now()` | role/status changes bump this |

Indexes: unique(`email`).

Validation: email format (Zod); password minimum strength policy (enforced in
the auth service, not the DB). Registration rejects duplicate emails (edge case).

---

## Entity: `session`

Custom DB-backed sessions. Schema follows a minimal design:
key columns summarized here.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | text (pk) | | opaque session id (random token, stored in cookie) |
| `user_id` | uuid | fk → users(id), not null | |
| `expires_at` | timestamptz | not null | |
| `created_at` | timestamptz | not null default `now()` | |

The role is **not** stored on the session — it is read from `users` per request
(D8), so role changes take effect immediately. Indexes on (`user_id`),
(`expires_at`) for expiry sweeps.

---

## Entity: `spaces`

A space (constitution Page-Tree mandate). **[hidden]** — this slice seeds exactly
one default space and never surfaces it in the UI (spec A9).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid (pk) | | |
| `slug` | text | unique not null | seeded `'default'` |
| `name` | text | not null | seeded `'Default'` |
| `default_locale` | text | not null default `'en'` | **[hidden]** single locale (A10) |
| `anonymous_read` | boolean | not null default `true` | configurable public-read (FR-019) |
| `created_at` | timestamptz | not null default `now()` | |

The space row carries `anonymous_read` so an admin can toggle public vs.
require-login reading at the space level (the constitution models anonymous read
as a permission, not a special path).

---

## Entity: `pages`

A wiki page. Canonical key `(space_id, path, locale)` (Page-Tree mandate); for
this slice `path` is user-defined and may contain `/`-separated segments
(e.g. `docs/intro/getting-started`). `slug` is the leaf segment of `path` and
is kept for internal display; it is not the canonical URL key.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid (pk) | | surrogate PK |
| `space_id` | uuid | fk → spaces(id), not null | **[hidden]** default space |
| `slug` | text | not null | leaf segment of `path`, for internal display; re-derived when `path` changes (FR-023) |
| `path` | text | not null | user-defined routing path; may contain `/`-separated segments; unique within `(space_id, locale)` (FR-020, FR-023) |
| `locale` | text | not null default `'en'` | **[hidden]** single locale (FR-021) |
| `title` | text | not null | current display title |
| `author_id` | uuid | fk → users(id), not null | creator/original author |
| `current_published_version_id` | uuid | fk → page_revisions(id), nullable | live revision readers see; null = no published version yet |
| `latest_version_id` | uuid | fk → page_revisions(id), nullable | newest revision (draft or published) |
| `deleted_at` | timestamptz | nullable | **[hidden]** soft-delete tombstone (FR-022); UI deferred |
| `created_at` | timestamptz | not null default `now()` | |
| `updated_at` | timestamptz | not null default `now()` | bumped on new revision/publish |

Indexes: unique(`space_id`, `path`, `locale`) — the canonical key; index on
(`space_id`) for the page list; partial index where `deleted_at is null and
current_published_version_id is not null` for the public list query.

Validation (service layer, Zod): `path` matches the rules
`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\/[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`
(lowercase letters, numbers, hyphens, and slashes; no leading, trailing, or
consecutive slashes; segments 1–100 chars). Uniqueness is enforced by the
unique index `(space_id, path, locale)` → conflicts returned as a clear
validation error (FR-023). `slug` is derived from the final segment of `path`
and is not edited independently. After creation the `path` may be changed via
the Page Properties screen; redirects from old paths are deferred, so the
unique index simply prevents conflicts.

---

## Entity: `page_revisions`

An immutable version snapshot (constitution Content-Versioning mandate; D4).
Every save creates one row.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid (pk) | | |
| `page_id` | uuid | fk → pages(id), not null | |
| `version_number` | integer | not null | sequential per page (1, 2, 3, …) |
| `locale` | text | not null default `'en'` | **[hidden]** single locale |
| `content_type` | contentType | not null default `'text/markdown'` | editor format |
| `content_source` | text | not null | raw Markdown (never HTML) — D10 |
| `content_html` | text | not null | rendered output stored at save (D1) |
| `content_hash` | text | not null | sha256 of `content_source`; cache identity |
| `author_id` | uuid | fk → users(id), not null | who created this revision |
| `status` | revisionStatus | not null default `'draft'` | draft/published (D4) |
| `published_at` | timestamptz | nullable | set when status → published |
| `created_at` | timestamptz | not null default `now()` | |

Indexes: unique(`page_id`, `version_number`); index (`page_id`, `status`,
`created_at desc`) for history listing; index (`content_hash`) for cache reuse
across revisions/pages.

Immutability: after insert, no column of a `page_revisions` row is updated
except the draft→published transition (`status`, `published_at`). Revisions are
never hard-deleted by normal operations (constitution).

---

## Relationships

```text
users 1───* session
users 1───* pages (author_id)
users 1───* page_revisions (author_id)
spaces 1──* pages
pages  1──* page_revisions
pages.current_published_version_id ──> page_revisions.id   (the live version)
pages.latest_version_id            ──> page_revisions.id    (newest, any status)
```

---

## Validation rules (service-layer, Zod-backed)

- **Registration**: email (valid, unique); password (minimum strength policy,
  e.g. ≥ 8 chars + class checks — enforced in `authService`, not DB).
- **Page create**: `path` validation (lowercase letters, numbers, hyphens,
  slashes; no leading/trailing/consecutive slashes) + uniqueness; `title`
  non-empty; `content_source` non-empty (a page may not be saved empty in this
  slice). `slug` is derived from the last `/`-separated segment of `path`.
- **Page properties update**: `path` re-validated and checked for uniqueness;
  `slug` is re-derived; no redirect from the old path is created (deferred).
- **Page delete**: soft-delete by setting `deleted_at`; only admin or the author
  may delete; hard delete is not exposed.
- **Page edit**: produces a new revision; `version_number` =
  `max(existing) + 1` computed in the same transaction; `content_hash` recomputed.
- **Publish**: only the author (or admin) may publish a revision of a page; on
  publish, set `status='published'`, `published_at=now()`, and atomically set
  `pages.current_published_version_id` to this revision.
- **Admin user update**: role ∈ {admin, editor, reader}; status ∈ {active,
  disabled}; password reset sets `password_hash` + `must_reset_password=true`.

---

## State transitions

### Revision status

```text
[created] ──save──> draft ──publish──> published
                       └────────────────── (drafts of a published page
                                            stay drafts until published;
                                            readers never see drafts)
```

- `draft → published`: by author/admin (publish action).
- `published` is terminal for a revision (a published revision is not
  "unpublished"; a new draft supersedes it as the next live candidate).
- A page is **visible to readers** iff `current_published_version_id is not null`.
- A page with only draft revisions is a draft page: visible only to its author
  and admins (D3).

### User status / role

```text
active ⇄ disabled     (admin toggle; disabled cannot log in)
role: reader ⇄ editor ⇄ admin   (admin reassignment; effective next request — D8)
must_reset_password: false → true (admin reset) → false (user sets new password)
```

---

## Permission resolution (this slice)

Implemented in the `can(actor, action, resource)` chokepoint (D3):

| Action | anonymous | reader | editor | admin | author-of-draft |
|---|---|---|---|---|---|
| list published pages | ✝ | ✓ | ✓ | ✓ | ✓ |
| read published page | ✝ | ✓ | ✓ | ✓ | ✓ |
| read draft page/revision | ✗ | ✗ | ✗ | ✓ | ✓ |
| create page | ✗ | ✗ | ✓ | ✓ | — |
| edit (new draft revision) | ✗ | ✗ | ✓ | ✓ | — |
| publish a revision | ✗ | ✗ | ✗‡ | ✓ | ✓‡ |
| delete a page | ✗ | ✗ | ✗ | ✓ | ✓ |
| view history | ✗ | own? | ✓ | ✓ | ✓ |
| manage users/roles | ✗ | ✗ | ✗ | ✓ | — |

✝ = allowed only when `spaces.anonymous_read = true` (default), else denied
(FR-019). ‡ = editor may publish revisions of pages they may edit (per A6,
editors edit any page); the author of a draft may publish their own draft. The
`can()` function is the sole interpreter of this matrix; per-page overrides are
deferred (A7) and would extend, not replace, this matrix.

---

## Forward-compatibility (no migration needed to add later)

The following are already in the schema so future slices add features, not
migrations:

- `spaces` + `pages.space_id` + `pages.path` → multi-space / hierarchy and
  user-defined multi-segment URLs.
- `pages.locale` + `page_revisions.locale` → content translations (UI i18n already
  implemented with standalone loc