# Phase 1 Data Model: Page Slug Routing

**Feature**: 035-page-slug-routing | **Date**: 2026-08-20

Drizzle schema lives in `apps/web/src/server/db/schema/index.ts`. Every
statement below is produced by `pnpm db:generate`; the SQL in this document is
illustrative of the intended shape, not something to hand-author into a
migration file (see plan.md § Migration Sequencing).

---

## 1. `pages.slug` — repurposed

The column exists today holding the leaf segment of `path`, written in six
places and read in none. Its meaning changes; its type does not.

| Field | Type | Before | After |
|---|---|---|---|
| `slug` | `text NOT NULL` | Leaf segment of `path` (`"install"`) | Full canonical address of a non-translation page within the space, no prefix, no leading separator (`"getting-started/install"`). Translation rows retain `''` and derive their address from their source page. |

**New constraint**

```sql
CREATE UNIQUE INDEX pages_space_slug_unique
  ON pages (space_id, slug)
  WHERE translation_group_id IS NULL;
```

- Soft-deleted rows are **included** — a deleted page keeps ownership of its
  address (FR-014a).
- Translation rows are **excluded** — they carry `slug = ''` and are addressed
  as `{locale}/{source.slug}` (research R9).

**Backfill** (appended to the generated SQL of migration run 1):

```sql
UPDATE pages SET slug = path WHERE translation_group_id IS NULL;
UPDATE pages SET slug = ''   WHERE translation_group_id IS NOT NULL;
```

This is what makes SC-001 true by construction: every non-translation address
that worked before the upgrade is now a canonical slug, while every translation
continues to derive the same locale-prefixed address from its source slug.

**Validation** (`slugSchema` in `packages/shared/src/pages.ts`): identical
character rules to the existing `pathSchema` — `^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$`,
1–200 characters, no leading/trailing/consecutive separators. Uppercase and
non-ASCII are **rejected**, never transliterated (FR-006).

### Address-mutation revision record

`page_revisions` gains a nullable immutable `address_change` JSONB value. Every
successful slug change, alias add/remove, address release, and cross-space or
prefix migration creates a normal next-numbered revision with the current full
content snapshot and this value populated. It records the operation and the
complete before/after canonical address plus alias set. Content-only revisions
leave it `NULL`.

This lets revision history explain address changes without treating metadata
updates as an exception to the page-revision mandate; `page_addresses` remains
the live resolver state, while a revision's `address_change` is never updated.

---

## 2. `page_addresses` — new

Every address that is *not* a page's canonical slug.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default random | |
| `space_id` | `uuid NOT NULL` → `spaces.id` | Scopes the namespace; an address is only meaningful under a space prefix |
| `address` | `text NOT NULL` | Space-scoped, prefix-free, no leading separator. May include a leading locale segment when the target is a translation row |
| `page_id` | `uuid NOT NULL` → `pages.id` `ON DELETE RESTRICT` | Points at the **page**, never at another address — this is what makes chains structurally impossible (research R6) |
| `kind` | `page_address_kind NOT NULL` | `retained` \| `manual` |
| `reason` | `text` | Free-text provenance for `retained` rows: `slug_change`, `cross_space_migration`, `writing_mode_switch`, `space_prefix_change` |
| `created_at` | `timestamptz NOT NULL` default now | Address history; never mutated |

**Constraints and indexes**

```sql
CREATE UNIQUE INDEX page_addresses_space_address_unique
  ON page_addresses (space_id, address);
CREATE INDEX page_addresses_page_idx ON page_addresses (page_id);
```

The unique index is the enforcement point for FR-014 — two concurrent writers
cannot both claim one address, which a read-then-write application check could
not guarantee.

`ON DELETE RESTRICT` on `page_id` is deliberate: a soft-deleted page keeps its
alias rows, and a hard delete must fail loudly rather than silently orphaning
public addresses.

**New enum**: `page_address_kind` = `('retained', 'manual')`, declared in
`apps/web/src/server/db/schema/enums.ts` alongside the existing enums.

---

## 3. `page_route_redirects` — removed

Today: `(id, legacy_route UNIQUE, target_page_id, reason, created_at)` where
`legacy_route` is a **full route** including the space prefix and a leading
`/`, written by `services/cross-space-migrations.ts:276` and
`jobs/writing-mode-switch.ts:139`.

Converted into `page_addresses` in migration run 1, then dropped in run 2:

```sql
INSERT INTO page_addresses (space_id, address, page_id, kind, reason, created_at)
SELECT s.id,
       substring(r.legacy_route from position('/' in substring(r.legacy_route from 2)) + 2),
       r.target_page_id,
       'retained',
       r.reason,
       r.created_at
FROM page_route_redirects r
JOIN spaces s
  ON s.route_prefix = split_part(r.legacy_route, '/', 2)
  OR (s.route_prefix IS NULL
      AND split_part(r.legacy_route, '/', 2)
          = CASE WHEN s.kind = 'wiki' THEN 'wiki' ELSE s.kind::text END)
ON CONFLICT (space_id, address) DO NOTHING;
```

The `route_prefix IS NULL` branch reproduces `effectiveRoutePrefix()` for rows
created before feature 032. Any `legacy_route` whose prefix resolves to no
space is dropped by the join — such a row already pointed at an unroutable
address and is dead data.

---

## 4. Derived, not stored

| Value | Derivation |
|---|---|
| Canonical address of an original page | `pages.slug` |
| Canonical address of a translation | `{pages.locale}/{source.slug}` where `source` is the row identified by `source_page_id` |
| Full public URL | `/{effectiveRoutePrefix(space)}/{canonical address}` — the existing `canonicalSpacePath()` with `slug` substituted for `path` |
| Breadcrumb trail | Ancestors derived from `pages.path`, each linking to that ancestor's own canonical address (research R7) |
| Tree structure | `pages.path` — unchanged |

---

## 5. Address lifecycle

```text
create page
  └─ slug := supplied ?? full tree path        (FR-004)
     └─ assertAddressAvailable → INSERT pages

change slug  B → C
  ├─ assertAddressAvailable(C)
  ├─ pages.slug := C
  └─ if page was ever published:                (FR-008, FR-012)
       INSERT page_addresses (B, kind='retained', reason='slug_change')
       INSERT one retained `{locale}/B` alias for every published translation
       of the page, each pointing to its translation row

add manual alias A
  ├─ assertAddressAvailable(A)
  └─ INSERT page_addresses (A, kind='manual')

remove alias
  ├─ kind='manual'   → requires page edit        (FR-021, FR-022a)
  └─ kind='retained' → requires space manage + explicit confirmation (FR-022)

soft delete page
  └─ no address rows change; addresses stay owned (FR-014a)

restore page
  └─ no address rows change; addresses come back intact

release addresses (space manage only)
  └─ DELETE page_addresses WHERE page_id = …; pages.slug := <reserved sentinel>
```

`assertAddressAvailable(tx, spaceId, address, selfPageId?)` is the single
validation chokepoint (research R2). It rejects when the address:

1. fails `slugSchema`;
2. has a reserved leading segment — built-in route, two-letter locale, or a
   static-site reserved prefix (research R5);
3. equals a `pages.slug` in that space other than `selfPageId`'s, **including
   soft-deleted pages**;
4. exists in `page_addresses` for that space and does not already belong to
   `selfPageId`.

Rejection messages name the violated rule, and name the conflicting page only
when the caller may read it (FR-018).

---

## 6. Transport DTOs

`LivePage`, page summaries, tree nodes, search results, and citation payloads
gain `slug: string`. This is what lets the 91 reader-href call sites switch
from `page.path` to `page.slug` (research R11).

The public API and MCP payloads gain:

```jsonc
{
  "path": "operations/onboarding/install",   // unchanged identity
  "slug": "getting-started/install",         // canonical address
  "url": "/wiki/getting-started/install",    // convenience, derived
  "aliases": [
    { "address": "support/faq", "kind": "retained", "createdAt": "…" }
  ]
}
```

`path` keeps its meaning and its role as the lookup key, so no existing
integration breaks (FR-028).
