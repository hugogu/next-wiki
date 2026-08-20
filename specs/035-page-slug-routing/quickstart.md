# Quickstart: Validating Page Slug Routing

**Feature**: 035-page-slug-routing | **Date**: 2026-08-20

How to prove this feature works end to end. Details live in
[data-model.md](./data-model.md) and
[contracts/page-address-api.md](./contracts/page-address-api.md); this file is
the run guide.

## Prerequisites

```bash
pnpm install
```

PostgreSQL 16+ reachable via `DATABASE_URL`. Stop any preview or manually
started dev server before running the e2e suite — leftover servers starve the
test run and the failures look like regressions.

## Apply migrations

```bash
pnpm db:migrate
```

Then confirm the schema and the generated migrations agree:

```bash
pnpm db:generate
```

This must report `No schema changes, nothing to migrate`. If it opens an
interactive rename prompt, stop — the snapshot chain is wrong. See plan.md
§ Migration Sequencing.

## Verify the backfill left every address unchanged

The critical upgrade property (SC-001). Against a database that has real pages
in it:

```bash
node -e "const{Client}=require('pg');const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>c.query(\"select count(*) as drift from pages where translation_group_id is null and slug <> path\")).then(r=>{console.log(r.rows[0]);return c.end()})"
```

Immediately after migrating, `drift` must be `0` — every pre-existing address
became its page's canonical slug. (It becomes non-zero later, as soon as
someone moves a page or edits a slug; that is the feature working.)

## Unit and integration tests

```bash
pnpm --filter @next-wiki/web test
```

Coverage this feature must add:

| Area | File | What it proves |
|---|---|---|
| Address validation | `src/server/services/page-addresses.test.ts` | Every rejection rule: malformed, uppercase, non-ASCII, reserved route segment, two-letter locale segment, static-site prefix, taken by a live page, taken by a **soft-deleted** page, taken by an alias, self-alias |
| Prefix relationships | same | `guides/deployment` and `guides/deployment/kubernetes` both save (FR-017) |
| Cross-space uniqueness | same | Same slug in two spaces both save (FR-005) |
| Concurrency | same | Two transactions racing for one address — one commits, one fails on the unique index, neither leaves a partial write |
| Slug lifecycle | `src/server/services/pages.test.ts` | Default slug = full tree path; tree move leaves slug untouched; published rename retains an alias; unpublished rename retains none and frees the address |
| Address revisions | `src/server/services/page-addresses.test.ts` | Every successful address mutation creates one next-numbered immutable page revision containing its complete before/after address change; content-only revisions leave that record empty |
| Chain collapse | same | A → B → C rename sequence leaves both A and B pointing at the page, so either resolves in one hop |
| Resolution order | `src/server/services/reader-routing.test.ts` | Live canonical beats stale alias; translation beats original; alias resolves; unknown 404s |
| No existence leak | same | An alias of a page the actor cannot read returns the same response as a direct request — no 301, no canonical address |
| Reserved rules | `src/server/routes/reserved-paths.test.ts` | Locale and static-site rules alongside the existing route-derived set |
| Import derivation | `src/server/jobs/transfer-import.test.ts` | Uppercase and non-ASCII source paths produce deterministic conforming addresses; a taken address never mutates the holder; re-running an unchanged import is idempotent |
| Static site | `src/server/static-site/*.test.ts` | Pages addressed by slug; one stub per alias; slug/alias case collision fails the run |
| Cache invalidation | `src/server/services/page-addresses.test.ts` and page-move/prefix tests | Slug changes, alias add/remove/release, cross-space moves, restores, and public-prefix changes invalidate public content and warm the affected published canonical address |

## Reader journeys (Playwright)

```bash
pnpm --filter @next-wiki/web test:e2e
```

Scenarios:

1. **Move survives** — publish a page, record its URL, move it to a different
   branch of the tree, revisit the original URL: `200`, same URL in the address
   bar, breadcrumbs show the *new* tree location.
2. **Rename forwards** — change the slug, request the old address: one `301` to
   the new address, page renders, `<link rel="canonical">` names the new
   address.
3. **Two renames, one hop** — rename again, request the oldest address: still a
   single `301`, straight to the newest address.
4. **Manual alias** — add an alias from the page properties dialog, visit it:
   `301` to canonical. Remove it: `404`.
5. **Retained alias is protected** — a user with page edit but not space manage
   cannot remove a retained alias; a space manager gets the confirmation
   warning first.
6. **Deleted page keeps its address** — delete a page, attempt to create another
   page at that address: rejected naming the conflict.
7. **Reserved words** — attempt `admin`, `zh/tutorial`, `_static/x`: each
   rejected with its own message before saving.
8. **Translation rename** — rename a source page with a published translation,
   then request the translation's former locale-prefixed address: it forwards in
   one hop to the translation's new canonical address.
9. **Three-step management** — from the page itself, add an alias and change a
   slug in no more than three deliberate user actions each.

## Manual verification

Run the dev server through the preview tooling (not `pnpm dev` in a shell):

- Rename a published page's slug and confirm the old URL forwards in one hop —
  check the network panel for exactly one `301`, and confirm the response is
  served from cache on the second request (no per-request database read, P12).
- Confirm a canonical page request produces the same cached ISR document it did
  before the feature.
- Confirm the page properties dialog lists canonical, retained, and manual
  addresses with distinct labels.

## Full-stack check

```bash
docker compose up -d --build
```

Then exercise the Wiki.js import against a source containing at least one
uppercase path and one non-ASCII path, and confirm the preview shows the
resulting address and the adjustment reason for each before the run.

## Lint and types

```bash
pnpm lint && pnpm typecheck
```

A useful sweep while finishing the reader-href refactor (research R11) — no
remaining call site should pass a `path` into an href helper:

```bash
grep -rn "Href(.*\.path\|canonicalSpacePath(.*\.path" apps/web/src apps/web/app --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```
