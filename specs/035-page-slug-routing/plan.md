# Implementation Plan: Page Slug Routing

**Branch**: `035-page-slug-routing` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-page-slug-routing/spec.md`

## Summary

Separate *where a page lives* from *where a page is published*. The tree path
keeps its existing job — page tree, breadcrumbs, permission inheritance,
import/export layout, and the identity used by the content API and MCP — and a
new canonical address, the **slug**, takes over public routing. Moving a page in
the tree stops changing its URL; changing its slug retains the previous address
as a permanent alias that forwards in a single hop; an owner may register extra
aliases; and every address lives in one namespace validated by one function, so
no new address can ever take over an address a reader already holds.

Technically this is three moves and a sweep:

1. **Repurpose `pages.slug`** — today a leaf-segment column that no routing,
   rendering, or API code reads — into the page's full canonical address,
   backfilled `slug = path` so no existing URL changes on upgrade (FR-024,
   SC-001). Its one reader, the seed's welcome-page existence check, switches
   to querying by `path`.
2. **Add `page_addresses`** for non-canonical addresses (retained + manual),
   absorbing today's `page_route_redirects` so there is exactly one alias
   mechanism, with uniqueness enforced by database indexes rather than by
   application scanning.
3. **Resolve and redirect inside the existing static reader route**, which
   already calls `permanentRedirect()` for retired space prefixes — so aliases
   inherit the proven ISR-cached redirect behavior and add no per-request
   database read for anonymous readers (P12).

Then a mechanical sweep of the 91 reader-href call sites that currently pass
`page.path`, switching them to `page.slug` once `slug` is carried on the DTOs
they already receive.

No new runtime dependency, no new service, no new deployment step.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime
floor) — unchanged from the rest of the monorepo.

**Primary Dependencies**: Next.js 16 App Router (static route + ISR +
`permanentRedirect`), Drizzle ORM, Zod (`@next-wiki/shared`), next-intl,
pg-boss (existing import/migration jobs only). **No new third-party
dependency.**

**Storage**: PostgreSQL 16+. One repurposed column (`pages.slug`), one new
table (`page_addresses`), one dropped table (`page_route_redirects`), two new
unique indexes. All produced by `pnpm db:generate` — see § Migration Sequencing
for the two-run requirement.

**Testing**: Vitest for services, address validation, derivation, and
resolution; Playwright for the reader redirect journeys and the properties UI.
Existing suites in `apps/web/src/server/services/*.test.ts`,
`apps/web/src/server/routes/reserved-paths.test.ts`, and
`apps/web/app/(public)/[...path]/page.test.tsx` all gain cases.

**Target Platform**: Linux server via Docker Compose / Kubernetes (unchanged).

**Project Type**: Web application in a pnpm + Turborepo monorepo.

**Performance Goals**: A request to a canonical address costs exactly what it
costs today (same ISR document, same cache tag). A request to an alias costs
one cached permanent redirect plus the canonical request — SC-008's "one
additional round trip". Address validation adds two indexed lookups to a write
that is already transactional.

**Constraints**: No per-request database read, session lookup, cookie read, or
header read on the anonymous canonical path (P12). Address uniqueness must be
enforced by the database, not by a read-then-write check, so two concurrent
writers cannot both claim one address. Every address change must invalidate the
public content cache through the existing `invalidatePublicContentCache()`.

**Scale/Scope**: Single-owner default. Address rows ≈ page count + alias count;
both are small (thousands). 91 reader-href call sites across 35 files, 6 page
write paths, 1 reader route, 1 static-site generator, 1 import pipeline.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle / Mandate | Verdict | Notes |
|---|---|---|
| P1 Simple deployment, personal by default | **PASS** | No new service, dependency, env var, or setup step. |
| P2 AI-native, never vendor-locked | **PASS** (N/A) | No AI surface touched beyond citation hrefs reading `slug` instead of `path`. |
| P3 Portable, self-growing AI memory | **PASS** | Page identity for API/MCP/export is unchanged (id + path). Slug is additive; no AI-specific code path. |
| P4 Rendering pipeline is sacred | **PASS** (N/A) | Pipeline untouched. Internal Markdown link resolution continues to resolve by path and renders canonical addresses. |
| P5 Permissions first-class | **PASS** | Both permission levels go through the existing `can()` chokepoint (research R10). Alias resolution re-checks read permission on the *final target* and returns the same not-found/forbidden response as a direct request — no existence or address leak (FR-023). |
| P6 Style system independence | **PASS** | Address-management UI reuses `src/components/ui/` primitives inside the existing page-properties dialog. No new entry point. |
| P7 Async-first for heavy operations | **PASS** | The one bulk operation (backfill) is a SQL data migration, not a request. Import/migration address derivation already runs inside pg-boss jobs. |
| P8 Version everything | **PASS** | Address changes are page metadata, not content, so they create no `page_revision` — the established convention for every page-metadata mutation in this codebase (`updateProperties` changes path and title, `setVisibility` changes who may read the page; neither writes a revision). Address history is nonetheless immutable and complete: every retained alias is an append-only row with `created_at` + `reason`, and both irreversible actions emit audit entries. See research R13 for why writing a revision here was evaluated and rejected. |
| P9 Open standards | **PASS** | REST + OpenAPI extended; HTTP 301 and `<link rel="canonical">` are the standard mechanisms. |
| P10 Explicit over implicit | **PASS** | Reserved-address rules stay in one module (`server/routes/reserved-paths.ts`) fed by the existing route manifest; address validation has exactly one exported chokepoint. |
| P11 Native navigation & unified entry points | **PASS with mandate amendment** | Strengthens the one-canonical-entry rule (every non-canonical address 301s). But it changes two documented invariants — the public page URL becomes `/<space-prefix>/<slug>` rather than `/<space-prefix>/<path>`, and breadcrumbs derive from the tree rather than from URL segments. See § Complexity Tracking. |
| P12 Public reading is static by default | **PASS** | Canonical pages keep today's `force-static` + `revalidate = 300`. Aliases resolve in the same route via `permanentRedirect()`, which Next caches like any other static result (research R4). Every address mutation calls the existing `invalidatePublicContentCache()`. |
| Mandate: Page Tree & Path System | **AMENDMENT REQUIRED** | Currently: "path is … authoritative for routing". Becomes: path authoritative for organization, permissions, import, and export; slug authoritative for routing. |
| Mandate: Frontend Routing & URL Contract | **AMENDMENT REQUIRED** | URL scheme line and breadcrumb-derivation line. |
| Anti-pattern: duplicate feature entry points | **PASS** | Exactly one address renders content; all others forward. |
| Anti-pattern: state without a URL | **PASS** (N/A) | No new user-reachable state. |

### Public Content Delivery

- **What changes**: not the document body, but the address it is served at, the
  canonical address declared in its metadata, and the set of addresses that
  forward to it.
- **Static representation**: canonical address → the existing `force-static`
  reader document, `revalidate = 300`, `dynamicParams = true`. Alias address →
  the same route resolving to `permanentRedirect(canonical)`, cached under the
  same policy. Neither reads a cookie, header, or session.
- **Invalidation**: every one of these calls `invalidatePublicContentCache()`
  (tag `public-content` at `'max'` + `revalidatePath('/', 'layout')`) and, for
  published pages, `enqueuePublicPageWarmup()` on the **new** canonical address:
  setting or changing a slug, adding or removing an alias, releasing a deleted
  page's addresses, moving a page within or between spaces, publishing,
  unpublishing, deleting, restoring, and changing a space's route prefix.
  Because the existing invalidation is tag-wide rather than per-path, no new
  invalidation granularity is required — only explicit, tested call sites for
  every mutation listed here.
- **Personalization**: unaffected. Address resolution uses only anonymous
  published data on the anonymous path.

### AI / Knowledge-Growth Surfaces

Not applicable as a source-of-truth or provenance change: this feature stores
no new source material, generates no knowledge, and gives no agent a new
mutation capability. The only AI-adjacent effect is that citation and retrieval
results render the page's canonical address instead of its tree path, so an AI
answer's source links keep working after a reorganization — a strict
improvement to P3's portability guarantee, with no change to what is retrieved
or how permissions are checked.

## Project Structure

### Documentation (this feature)

```text
specs/035-page-slug-routing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── page-address-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
└── pages.ts                              # slugSchema, aliasSchema, address DTOs

apps/web/src/server/
├── db/
│   ├── schema/index.ts                   # pages.slug repurposed; page_addresses added;
│   │                                     #   page_route_redirects dropped (2nd generate run)
│   └── migrations/                       # generated only — never hand-authored
├── routes/
│   ├── manifest.ts                       # unchanged (route-derived reserved set)
│   └── reserved-paths.ts                 # + locale-segment and static-site prefix rules
├── services/
│   ├── page-addresses.ts                 # NEW: the single validation/mutation chokepoint
│   │                                     #   assertAddressAvailable, setSlug, addAlias,
│   │                                     #   removeAlias, releaseAddresses, deriveImportAddress
│   ├── pages.ts                          # create/updateProperties/remove/moveToSpace
│   ├── reader-routing.ts                 # resolve by slug, then alias, then legacy
│   ├── space-routes.ts                   # findPageRouteRedirectTarget → address lookup
│   ├── cross-space-migrations.ts         # writes page_addresses instead of redirects
│   ├── transfer-page-writer.ts           # slug assignment on every writer
│   └── public-content.ts                 # slug on public DTOs
├── seed/index.ts                         # welcome-page existence check by path, not slug
├── static-site/
│   ├── paths.ts                          # address by slug; alias conflict detection
│   └── (generator)                       # + per-alias redirect stub
└── jobs/
    ├── transfer-import.ts                # deriveImportAddress + adjustment reporting
    ├── transfer-preview.ts               # preview shows resulting address
    └── writing-mode-switch.ts            # writes page_addresses instead of redirects

apps/web/src/
├── lib/path.ts                           # helpers unchanged; callers pass slug
└── components/pages/
    ├── PagePropertiesDialog.tsx          # slug field + address list + alias management
    ├── EditPageForm.tsx                  # slug error mapping
    └── NewPageDialog.tsx                 # default slug preview

apps/web/app/
├── (public)/[...path]/page.tsx           # canonical render vs. alias permanentRedirect
└── api/v1/pages/                         # slug + aliases on read; slug on write

packages/mcp-server/                      # page tools expose slug + aliases
docs/architecture/mandates.md             # amended invariants (see Complexity Tracking)
```

**Structure Decision**: Standard monorepo layout, no new top-level directory.
The one new module is `apps/web/src/server/services/page-addresses.ts`, created
so that "the single authoritative address namespace" is a single importable
chokepoint rather than a rule repeated across six write paths. Everything else
is modification of existing files listed above.

## Migration Sequencing

`pnpm db:generate` must be run **twice, as two separate migrations**, per the
hazard documented in `CLAUDE.md`:

1. **Run 1** — repurpose `pages.slug` (widen semantics, add unique index on
   `(space_id, slug) WHERE translation_group_id IS NULL`) and create
   `page_addresses`. Append the backfill statements to the *generated* `.sql`
   only: `UPDATE pages SET slug = path WHERE translation_group_id IS NULL`
   (including soft-deleted rows) and the `page_route_redirects → page_addresses`
   conversion described in research R3.
2. **Run 2** — drop `page_route_redirects`.

Splitting the drop from the create keeps either diff from looking like a table
rename, which `drizzle-kit generate` would surface as an interactive prompt that
a non-interactive session cannot answer. After each run, re-run `pnpm
db:generate` with no further edits and confirm `No schema changes, nothing to
migrate`. Never touch `meta/_journal.json` or a generated `meta/NNNN_snapshot.json`.

Because the test database is persistent (`wiki_test`), a new migration can end
up recorded-but-not-applied; drop and rebuild it if migration-dependent tests
fail in a way the SQL does not explain.

## Complexity Tracking

Two documented invariants change. Neither is incidental complexity to be
designed away — they are the point of the feature — but both require a governed
amendment before merge, and the constitution's versioning policy makes a change
to a mandate's one-line invariant a **MAJOR** bump (2.3.0 → 3.0.0).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Page Tree & Path System**: "path is … authoritative for routing" becomes "slug is authoritative for routing; path is authoritative for organization, permissions, import, and export". | This *is* the feature. Decoupling tree structure from the URL is impossible while the path is the routing key. | Keeping the path authoritative and layering aliases on top was considered: every tree move would still change the canonical URL and merely leave a forward behind, so URLs would churn with every reorganization and the "published address never changes" guarantee would be reduced to "published address always forwards". Rejected — it inverts the guarantee the user asked for. |
| **Frontend Routing & URL Contract**: public page URL `/<space-prefix>/<path>` becomes `/<space-prefix>/<slug>`; breadcrumb segments derive from the page tree rather than from URL segments. | Follows necessarily from the first amendment. Once the URL no longer mirrors the tree, URL-derived breadcrumbs would describe a hierarchy that does not exist. | Deriving breadcrumbs from slug segments was considered and rejected: a page deliberately given the short slug `faq` would render one meaningless crumb while genuinely sitting three levels deep, losing exactly the organizational signal a breadcrumb exists to carry (research R7). |

**Not** treated as complexity requiring justification, because each is a
narrowing rather than a new capability: the two-table address namespace (R2),
the two-run migration (R3), and the per-alias static-site stub (R12).

## Phase Outputs

- **Phase 0** → [research.md](./research.md) — 12 resolved design questions.
- **Phase 1** → [data-model.md](./data-model.md),
  [contracts/page-address-api.md](./contracts/page-address-api.md),
  [quickstart.md](./quickstart.md).
- **Phase 2** → `tasks.md`, produced by `/speckit-tasks`. Not created here.
