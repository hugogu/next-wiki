# Phase 0 Research: Page Slug Routing

**Feature**: 035-page-slug-routing | **Date**: 2026-08-20

All five spec ambiguities were resolved in the clarification session, so no
`NEEDS CLARIFICATION` markers entered this phase. The research below resolves
the *design* unknowns that follow from those answers.

---

## R1. Where the canonical address lives

**Decision**: Repurpose the existing `pages.slug` column to hold the page's
full canonical address (space-scoped, no space prefix, no leading separator),
backfilled from `pages.path`. Add a unique index on `(space_id, slug)` scoped
to non-translation rows.

**Rationale**: `pages.slug` already exists and is **effectively dead data**.
It is set in six places (`services/pages.ts:1061`, `:1330`,
`services/public-content.ts:2002`, `services/cross-space-migrations.ts:277`,
and every writer in `services/transfer-page-writer.ts`) as
`path.split('/').at(-1)` — the leaf segment — and no routing, rendering, or API
code reads it. Every other `.slug` read in the codebase is `spaces.slug`.

There is exactly one read: `server/seed/index.ts:196` uses
`eq(pages.slug, 'welcome')` to decide whether the shipped welcome page already
exists. The backfill happens to leave that query correct — the welcome page's
path is also `welcome`, so its slug is unchanged — but the query is testing
identity, not address, so it should switch to `eq(pages.path, 'welcome')` as
part of this work rather than relying on the two staying equal.

Repurposing the column removes dead weight instead of adding a parallel one, and
the backfill `UPDATE pages SET slug = path` is a single statement that makes
every pre-existing address canonical by construction (satisfies FR-024 and
SC-001 with no per-page logic).

**Alternatives considered**:

- *New `pages.canonical_address` column, leave `slug` alone*: leaves a dead
  column behind and forces a "which one is real" question on every future
  reader. Rejected.
- *No denormalized column; derive the canonical address from the address table
  on every read*: costs a join per row on the page tree, search results,
  sitemap, and static-site generation — the three highest-fan-out read paths.
  Rejected on read cost, not on correctness.

---

## R2. Shape of the address namespace

**Decision**: Two tables, one lookup function.

- Canonical addresses live in `pages.slug`, uniqueness enforced by a DB unique
  index.
- Non-canonical addresses (retained after a rename, or manually added) live in
  a new `page_addresses` table, uniqueness enforced by a DB unique index on
  `(space_id, address)`.
- A single service function `assertAddressAvailable(tx, spaceId, address,
  selfPageId?)` checks both tables and is the *only* place any write path may
  validate an address.

**Rationale**: The spec calls for "a single authoritative address namespace",
which is a behavioral requirement, not a storage requirement. Putting canonical
rows in the same table as aliases would give two sources of truth for the same
fact (`pages.slug` denormalization vs. the canonical row) with no cross-table
constraint able to keep them agreeing. Splitting by *kind* instead — exactly one
canonical per page enforced by a column, N aliases enforced by a table — makes
each fact storable in exactly one place, and reduces "single namespace" to a
single function every writer calls. Two indexed lookups per validation is
negligible against a write that already runs inside a transaction.

Soft-deleted pages keep their rows in both tables, so FR-014a falls out of the
same uniqueness indexes with no extra predicate — the address stays taken
because the row stays present.

**Alternatives considered**:

- *One `page_addresses` table holding canonical and alias rows, with a partial
  unique index for "exactly one canonical per page"*: elegant on paper, but the
  denormalized `pages.slug` still has to exist for read performance (R1), so it
  reintroduces the dual-source-of-truth problem it was meant to avoid.
  Rejected.
- *Validate by scanning a materialized view of all addresses*: adds a
  refresh-lag failure mode to a correctness check. Rejected.

---

## R3. Folding `page_route_redirects` into `page_addresses`

**Decision**: Migrate the existing `page_route_redirects` rows into
`page_addresses` and drop the old table, across **two separate
`pnpm db:generate` runs**.

**Rationale**: `page_route_redirects` is already an alias table — `legacy_route
→ target_page_id` plus a `reason` — written by cross-space migration
(`services/cross-space-migrations.ts:276`) and the writing-mode switch job
(`jobs/writing-mode-switch.ts:139`). Keeping it alongside `page_addresses`
would be exactly the "parallel mechanism" the spec's Dependencies section
rules out: two tables answering the same question, with two chances to disagree
about who owns an address.

The one shape difference is scope. `legacy_route` stores a **full route**
including the space prefix and a leading `/` (`canonicalSpacePath(space, path,
locale)` produces `/wiki/zh/foo`), and its uniqueness is global.
`page_addresses.address` is **space-scoped and prefix-free**, matching how the
spec describes the namespace. The data migration therefore splits each
`legacy_route` on its first segment, resolves that prefix to a `space_id` via
`spaces.route_prefix` (falling back to the built-in default for the rows that
predate feature 032 and have a null prefix), and stores the remainder as
`address`.

Any locale segment stays *inside* `address`. That is consistent rather than
sloppy: an alias row points at one specific `pages` row, and a translation is
its own `pages` row, so `(space, "zh/foo") → <translation page id>` is exactly
as well-formed as `(space, "foo") → <source page id>`.

**Two generate runs** — run 1 creates `page_addresses` (with the backfill
appended to the generated SQL, which `CLAUDE.md` explicitly permits), run 2
drops `page_route_redirects` — because a single diff containing one table
dropped and another created is precisely the shape `drizzle-kit generate` can
misread as an interactive rename prompt, and an agent session has no terminal
to answer one. `CLAUDE.md` documents this hazard from commits `044ab59` and
`705fdb2`.

**Alternatives considered**:

- *Evolve `page_route_redirects` in place* (add `space_id`/`address`/`kind`,
  drop `legacy_route`): avoids the rename hazard entirely and is the smaller
  diff, but leaves a table whose name describes one of its three row kinds.
  Rejected on clarity, and because the two-run sequence already neutralizes the
  hazard.
- *Leave `page_route_redirects` in place and check both tables*: rejected by
  the spec.

---

## R4. Serving a cacheable permanent redirect from a static route

**Decision**: Aliases resolve inside the existing
`app/(public)/[...path]/page.tsx` route and call `permanentRedirect()`. No
middleware, no `next.config` redirect table.

**Rationale**: The route is already `export const dynamic = 'force-static'`
with `revalidate = 300` and `dynamicParams = true`, and it **already** calls
`permanentRedirect(canonicalSpacePath(...))` for the `resolved.legacy` case
(retired space prefixes and moved pages). Next.js caches the redirect result of
a statically generated route exactly like it caches a rendered one, so an alias
costs one cached response and no per-request database read — satisfying P12 and
the spec's Public Content Delivery section through a mechanism already proven
in this codebase.

Middleware was considered and rejected on two grounds: it runs per request
(defeating the cache requirement), and the memory note
`project_next16_caching_gotchas` records that middleware cannot override
`Cache-Control` on dynamic pages in this Next version.

`next.config` static redirects were rejected because the alias set is
user-editable data, not build-time configuration.

---

## R5. Reserved addresses

**Decision**: Reuse `server/routes/reserved-paths.ts` unchanged for the
built-in-route rule, and add two rules beside it in the same module: reject a
leading segment matching `/^[a-z]{2}$/` (the locale position), and reject the
static-site prefixes already listed in `static-site/paths.ts`
(`_static`, `_assets`, `pagefind`) plus its reserved root files.

**Rationale**: `RESERVED_ROUTES` is computed at module load by walking the
`app/` directory (`server/routes/manifest.ts`), so adding a built-in route
automatically protects its address — FR-015's "derived from the application's
actual routes rather than a separately maintained list" is already satisfied by
existing code. The locale rule mirrors `LOCALE_PREFIX_RE` in
`services/reader-routing.ts:8` and the identical guard already present in
`services/space-routes.ts:48` for space prefixes. Importing the static-site
constants keeps one definition rather than a copy.

**Alternatives considered**: A hand-maintained reserved-word list — rejected,
it drifts the moment someone adds a route.

---

## R6. Collapsing redirect chains

**Decision**: Collapse at write time. When a page's slug changes from B to C,
the same transaction (a) inserts `(space, B) → page` and (b) re-points every
existing `page_addresses` row already targeting that page — so a chain
A → B → C never forms, because A always pointed at the *page*, never at
address B.

**Rationale**: Storing `address → page_id` rather than `address → address`
makes chains structurally impossible; step (b) is a no-op in the common case
and exists only for rows migrated from `page_route_redirects`. This matches
the existing mandate ("Redirect chains are resolved to their final target at
write time, not read time") and delivers FR-009's single-hop guarantee without
any read-time loop. A self-referential alias (address equal to the page's own
current slug) is rejected by `assertAddressAvailable` because the canonical
lookup finds the page itself.

---

## R7. Breadcrumbs after the URL and the tree diverge

**Decision**: Breadcrumbs are derived from the page's **tree path**, not from
the URL segments. The reader route resolves the page first, then builds
breadcrumbs from `pages.path` ancestry as it does today.

**Rationale**: This is the one place where decoupling forces a visible
behavioral choice. The tree path is what expresses "where this page lives", and
that is what a breadcrumb communicates; deriving crumbs from a slug like
`faq` would produce a single meaningless crumb for a page that genuinely sits
three levels deep. Intermediate crumbs link to their ancestor pages' **canonical
addresses**, so every crumb is still a real, navigable URL and no crumb points
at a URL that forwards.

This does contradict the current wording of the Frontend Routing mandate
("Breadcrumb segments are derived from the current URL and the page tree") and
is one of the mandate amendments this feature requires. See plan.md
§ Complexity Tracking.

---

## R8. Deterministic address derivation for import and batch create

**Decision**: One shared function `deriveImportAddress(sourcePath, taken)`
applied by Wiki.js import, archive import, and batch create:

1. Normalize: NFC, lowercase, strip a leading/trailing separator, collapse
   repeated separators.
2. Replace every run of characters outside `[a-z0-9_-]` within a segment with a
   single `-`; drop segments that become empty.
3. If the result is empty, or its leading segment is reserved, prefix the
   space's own fallback segment (`page`).
4. If the result is taken, append `-2`, `-3`, … until free.

Each adjustment records `{ sourcePath, address, reason }` in the run result.

**Rationale**: FR-006 rejects uppercase and non-ASCII, but a Wiki.js path may
legitimately contain both, so import cannot simply copy the source path — this
gap was found during clarification and is now FR-026. Deterministic derivation
(rather than a random suffix) means re-running an import against an unchanged
source produces the same addresses, which is what makes import re-runs safe.
Suffixing with `-2` rather than a hash keeps the address human-readable, and
never touching an already-assigned address satisfies FR-026's "MUST NOT alter
any existing page's address".

**Alternatives considered**: Failing the whole import on the first
non-conforming path — rejected, it makes a large migration unusable for a
single stray uppercase letter.

---

## R9. Backfill and translations

**Decision**: The data migration sets `slug = path` for every non-translation
page row, including soft-deleted ones. Translation rows (`translation_group_id
IS NOT NULL`) get `slug = ''` and are never addressed by their own slug; a
translation's canonical address is computed as `{locale}/{source.slug}`, which
is how `resolveReaderPage` already builds it from `{locale}/{source.path}`.

**Rationale**: Backfilling soft-deleted rows too is what makes FR-014a work —
a deleted page can only keep its address if it has one. Leaving translations
slug-less keeps the spec's "translations do not get independent slugs"
assumption enforced by data shape rather than by convention, and means the
unique index on `(space_id, slug)` needs a `WHERE translation_group_id IS NULL`
predicate rather than tolerating many empty strings.

---

## R10. Where the permission split is enforced

**Decision**: Both levels go through the existing `can()` chokepoint in
`server/permissions`. Slug changes and manual-alias add/remove reuse the
`edit` action on the page resource (the same check `updateProperties` already
performs). Removing a retained alias and releasing a deleted page's addresses
require `manage` on the space resource.

**Rationale**: P5 forbids a parallel permission path, and the two irreversible
actions map cleanly onto an action/resource pair the model already has. No new
permission axis, no new scope, and in a single-owner deployment the owner
satisfies both with zero configuration (P1/P5).

The API-key surface needs no new scope: address changes ride the existing
page-write scope, matching how path changes work today.

---

## R11. Scope of the reader-href refactor

**Finding, not a decision**: 91 call sites across 35 non-test files use
`getPageHref` / `getSpaceHref` / `canonicalSpacePath` /
`getConfiguredSpaceHref` / `getTranslatedPageHref`.

The helpers themselves need **no signature change** — they take an address
string and encode it. What changes is the *value* callers pass: `page.path`
becomes `page.slug`. So the refactor is mechanical (change the field read) once
`slug` is present on the DTOs those call sites already receive (`LivePage`,
page summaries, search results, tree nodes, citations). Adding `slug` to those
DTOs is therefore the first implementation step, and the call-site sweep is
verifiable by a lint rule or a grep for `Href(.*\.path` rather than by
inspection.

---

## R12. Static site publishing

**Decision**: `static-site/` addresses pages by `slug` instead of `path`, and
emits one additional redirect stub (`<alias>/index.html` with a
`<meta http-equiv="refresh">` plus `<link rel="canonical">`) per alias of an
eligible page.

**Rationale**: A Git-served static host (GitHub Pages) cannot issue a 301, so
the meta-refresh stub with a canonical link is the standard equivalent and is
what preserves the spec's permanence guarantee on the published copy.
`findPathConflicts` in `static-site/paths.ts` continues to run, now over slugs
and alias addresses together, so a case collision between a slug and an alias
still fails the run before anything is written.
