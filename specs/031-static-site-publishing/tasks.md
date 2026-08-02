---
description: "Task list for 031-static-site-publishing"
---

# Tasks: Static Site Publishing

**Input**: Design documents from `/specs/031-static-site-publishing/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/admin-api.md](./contracts/admin-api.md)

**Tests**: INCLUDED. Two binding reasons, not a stylistic choice — the
constitution requires tests for features touching permissions and public APIs
(this touches both), and SC-002 defines a release-blocking negative assertion
that only exists as a test. The leak test (T034) gates every task after it.

**Organization**: Grouped by user story. Each story is independently testable at
its checkpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no dependency on incomplete work
- **[Story]**: US1–US7, mapping to the spec's user stories

## Path Conventions

Monorepo per [plan.md](./plan.md): `apps/web/` (Next.js app, `src/server/` is
server-only), `packages/shared/` (zero-dep schemas), `scripts/`, `docker/`.
Tests live beside their subject as `*.test.ts` (Vitest) and in `apps/web/e2e/`
(Playwright), matching existing convention.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and build plumbing that later phases assume exist.

- [X] T001 [P] Add `esbuild` as a devDependency of `apps/web` in `apps/web/package.json`, pinned to an exact version
- [X] T002 [P] Add a pinned `pagefind_extended` binary to the runner stage in `docker/Dockerfile`, choosing a release after the musl jemalloc fix per research R4, alongside the existing `apk add git openssh-client`
- [X] T003 [P] Add a `build:static-site-assets` script to `apps/web/package.json` and wire it into the build pipeline in `turbo.json`
- [X] T004 [P] Create `packages/shared/src/static-site.ts` with the module skeleton and export it from `packages/shared/src/index.ts`, keeping the package zero-dependency
- [X] T005 Document the new binary and build-time dependency in `docs/deployment.md`, stating that a deployment which never publishes pays no runtime cost

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared transport, persistence, service layer, and admin surface.
No user story can begin until this is complete.

**⚠️ T006–T008 must land as their own refactoring commit** with Git export's
existing tests unchanged and passing, before any static-site code depends on
them (plan delivery step 1; project convention: refactoring and feature work do
not share a commit).

### Shared Git transport extraction (refactor only, no behavior change)

- [X] T006 Extract `buildGitEnvironment()` and the `git()` invocation wrapper from `apps/web/src/server/jobs/git-export.ts` into a new `apps/web/src/server/git/transport.ts`, preserving the timeout, `GIT_ASKPASS`, and SSH option behavior verbatim
- [X] T007 Update `apps/web/src/server/jobs/git-export.ts` to import from `apps/web/src/server/git/transport.ts`, deleting the moved code
- [X] T008 Add `apps/web/src/server/git/transport.test.ts` covering credential-environment construction for both auth modes and confirming no secret reaches argv; run `apps/web/src/server/jobs/git-export.test.ts` unchanged and green

### Schemas and persistence

- [X] T009 [P] Define Zod schemas and inferred types in `packages/shared/src/static-site.ts`: `staticSiteTargetUpsertSchema`, `StaticSiteTargetView`, `StaticSitePublicationView`, `staticSiteExclusionReason`, reusing the existing Git remote-URL and branch-name validation rules
- [X] T010 [P] Add `staticSitePublicationStatusEnum`, `staticSitePublicationTriggerEnum`, and `staticSiteAuthModeEnum` to `apps/web/src/server/db/schema/enums.ts`
- [X] T011 Add the `static_site_targets` and `static_site_publications` tables to `apps/web/src/server/db/schema/index.ts` per [data-model.md](./data-model.md), with the `(target_id, created_at DESC)` index and `ON DELETE CASCADE`
- [X] T012 Generate the migration by running `pnpm db:generate` — never hand-author the SQL or edit `meta/_journal.json`; then run `pnpm db:generate` a second time with no further edits and confirm it reports no schema changes
- [X] T013 [P] Add `staticSitePublish` and `staticSiteTick` queue ids plus their expiry floors to `apps/web/src/server/jobs/runtime.ts`

### Service layer and REST surface

- [X] T014 Implement target CRUD, secret encryption via `@/server/crypto/key-encryption`, and admin permission enforcement in `apps/web/src/server/services/static-site.ts`, following the `assertCanManage*` chokepoint pattern used by `services/git-export.ts`
- [X] T015 [P] Add `apps/web/src/server/services/static-site.test.ts` asserting the secret is never returned in any view, that enabling without a stored secret is rejected, and that non-admin actors are denied without disclosing configuration
- [X] T016 [P] Implement `GET`/`PUT`/`DELETE` in `apps/web/app/api/static-site/target/route.ts` per the contract, with `@openapi` JSDoc blocks placed directly above each export (multi-line only — a collapsed block corrupts `@summary`)
- [X] T017 [P] Implement `POST apps/web/app/api/static-site/target/ssh-key/route.ts` mirroring the existing Git export SSH-key route
- [X] T018 [P] Add `apps/web/app/api/static-site/target/route.test.ts` covering validation failures, admin-only access, and the 200/202 split on save-disabled versus save-enabled
- [X] T019 Register the publish queue and handler explicitly in `apps/web/src/server/jobs/register.ts` (no dynamic discovery, per P10), with a stub handler that fails loudly until T031 lands

### Admin entry point

- [X] T020 Create the single admin route `apps/web/app/(admin)/admin/static-site/page.tsx` and add exactly one navigation entry for it; do not add an entry under Admin → Storage
- [X] T021 [P] Build the target configuration form in `apps/web/src/components/admin/static-site/TargetForm.tsx` using `@/components/ui` primitives only, including copy that states plainly this is a different feature from Git export
- [X] T022 [P] Add new admin and shell message keys to `apps/web/messages/en.json` and `apps/web/messages/zh.json`, keeping the existing catalog-parity test green

**Checkpoint**: an operator can configure and validate a target. Nothing is published yet.

---

## Phase 3: User Story 1 — Publish a public reader site (P1) 🎯 MVP

**Goal**: A configured target produces a browsable HTML site at a public URL.

**Independent Test**: configure a target, publish, open the public URL, and
confirm the home page lists the page tree and any published page opens and reads
correctly.

**Note on ordering**: the full five-condition eligibility filter (FR-007) is
implemented *here*, not deferred to US2. A first release that publishes
everything and is filtered later would leak on its very first run, and the
artifact is public and mirrored — irreversible. US2 adds the surrounding
guarantees (link downgrade, asset scoping, exclusion reporting) and the proof.

### Tests for User Story 1

- [X] T023 [P] [US1] Write `apps/web/src/server/static-site/eligibility.test.ts` asserting all five FR-007 conditions, including raw and generated space exclusion; must fail before T026
- [X] T024 [P] [US1] Write `apps/web/src/server/static-site/paths.test.ts` covering directory-form addresses, base-path resolution for root and sub-path hosting, NFC normalization of non-ASCII paths, case-collision detection, and reserved-prefix collision

### Implementation for User Story 1

- [X] T025 [P] [US1] Implement address form, base-path normalization, percent-encoding, case-collision and reserved-prefix detection in `apps/web/src/server/static-site/paths.ts`
- [X] T026 [US1] Implement the single publishable-set query in `apps/web/src/server/static-site/eligibility.ts`, returning pages, path index, translation groups, asset ids, and exclusion counts per [data-model.md](./data-model.md)
- [X] T027 [US1] Implement the static document shell in `apps/web/src/server/static-site/document.tsx` using `renderToStaticMarkup` over `@/components/ui` primitives, embedding body HTML from `renderMarkdown()` and heading ids from `injectHeadingIds()`
- [X] T028 [P] [US1] Implement page-tree, breadcrumb, and home-page navigation data in `apps/web/src/server/static-site/navigation.ts`, derived only from the publishable set
- [X] T029 [P] [US1] Implement asset selection and export in `apps/web/src/server/static-site/assets.ts`, reading through `readImageFromDatabase` and scoping to eligible published revisions only
- [X] T030 [US1] Implement snapshot assembly in `apps/web/src/server/static-site/snapshot.ts`: documents, home page, `404.html`, `sitemap.xml`, `.nojekyll`, and the manifest, written into a temp directory
- [X] T031 [US1] Implement the publish job in `apps/web/src/server/jobs/static-site-publish.ts`: generate into temp, then replace the checkout tree, commit, and push via `git/transport.ts`, with `--force-with-lease` divergence recovery and run-record state transitions
- [X] T032 [US1] Implement size preflight in `apps/web/src/server/static-site/preflight.ts` and call it before delivery, failing the run with an explanatory message rather than pushing an over-limit artifact
- [X] T033 [US1] Implement `POST`/`GET apps/web/app/api/static-site/publications/route.ts` and `GET apps/web/app/api/static-site/publications/[id]/route.ts`, returning 202 with the queued run and collapsing triggers during an active run
- [X] T034 [US1] Add `apps/web/src/server/static-site/snapshot.test.ts` generating a full snapshot from a seeded fixture into a temp directory and asserting the artifact layout contract
- [X] T035 [US1] Add run status and counts to the admin panel in `apps/web/src/components/admin/static-site/PublishStatus.tsx`, polling the run endpoint and linking to the live site
- [ ] T036 [US1] Add `apps/web/e2e/static-site-publish.spec.ts` covering configure → publish → status reaches succeeded with counts shown

### Gaps found by `/speckit.analyze` (must land within this phase)

- [X] T090 [US1] **Empty-set guard**: abort the run in `apps/web/src/server/static-site/snapshot.ts` when the publishable set is empty, failing with an explicit reason instead of delivering an empty tree. Without this, FR-004's full-replacement semantics turn one bad eligibility result into a silently wiped public site. Must land before T031 delivers anything
- [X] T091 [P] [US1] Add the empty-set and credential-failure cases to `apps/web/src/server/jobs/static-site-publish.test.ts`, asserting the previous delivery survives both
- [ ] T092 [US1] **Target validation**: add `POST apps/web/app/api/static-site/target/validation/route.ts` performing a dry-run connectivity and write-permission check, and surface it in `TargetForm.tsx`. Spec US1 scenario 2 begins "Given a validated target" and is untestable without it

**Checkpoint**: a published site exists and is browsable. MVP.

---

## Phase 4: User Story 2 — Publish only what is already public (P1)

**Goal**: Provable non-disclosure — no trace of any ineligible page anywhere in
the artifact.

**Independent Test**: seed a wiki mixing restricted pages, non-anonymous spaces,
raw and generated spaces, and cross-links into all of them; generate a snapshot;
scan every byte for excluded titles, paths, and asset ids.

### Tests for User Story 2

- [ ] T037 [US2] Write the release-blocking leak test in `apps/web/src/server/static-site/disclosure.test.ts`: seed the mixed fixture, generate a snapshot, and scan every file in the artifact for each excluded page's title, path, excerpt, and asset id — **and for credential material**, closing FR-034's artifact clause. **A failure here is a release blocker, never a test to adjust.**
- [ ] T038 [P] [US2] Write `apps/web/src/server/static-site/links.test.ts` asserting that links to ineligible pages become plain text carrying no address, and that links to eligible pages resolve correctly under both root and sub-path base paths

### Implementation for User Story 2

- [X] T039 [US2] Implement internal link resolution and non-eligible downgrade in `apps/web/src/server/static-site/links.ts`, operating on rendered HTML after `renderMarkdown()`
- [X] T040 [US2] Wire link rewriting into `apps/web/src/server/static-site/snapshot.ts` so every document passes through it
- [X] T041 [P] [US2] Implement `GET apps/web/app/api/static-site/eligibility/route.ts` returning counts and exclusion reasons only — never titles or paths
- [X] T042 [P] [US2] Persist `exclusion_summary` counts on each run record in `apps/web/src/server/jobs/static-site-publish.ts`
- [ ] T043 [US2] Show the pre-publish summary and per-run exclusions grouped by reason in `apps/web/src/components/admin/static-site/EligibilitySummary.tsx`, including the space-kind withholding notice required by FR-014 with a link back into the wiki
- [ ] T044 [P] [US2] Add `apps/web/app/api/static-site/eligibility/route.test.ts` asserting the response carries counts only and is admin-only

**Checkpoint**: non-disclosure is asserted mechanically, not by inspection.

---

## Phase 5: User Story 3 — Read the site the way readers read the wiki (P1)

**Goal**: Visual and rendering parity, self-contained assets, dark mode, anchors.

**Independent Test**: publish a page set exercising headings, code, math,
diagrams, tables, images, and links; compare each page against the wiki reader;
then browse with the wiki stopped and confirm nothing fails to load.

### Tests for User Story 3

- [ ] T045 [P] [US3] Write `apps/web/src/server/static-site/document.test.ts` asserting the shell contains no edit, AI, admin, account, or sign-in affordance, and that every `href`/`src` it generates resolves inside the artifact
- [ ] T046 [P] [US3] Write `apps/web/scripts/build-static-site-assets.test.mjs` asserting the built CSS and JS exist, are content-hashed, and that the CSS references no absolute external URL

### Implementation for User Story 3

- [X] T047 [US3] Implement `apps/web/scripts/build-static-site-assets.mjs`: compile `apps/web/app/globals.css` with the Tailwind CLI scanning the static-site shell, bundle the client runtime with esbuild, copy `katex.min.css` and its fonts from `node_modules`, and emit content-hashed filenames
- [X] T048 [US3] Implement the client runtime entry in `apps/web/src/static-site/client/index.tsx`, mounting the existing `ContentRenderer` over the pipeline's `[data-code-block]` / `[data-mermaid-block]` markers and loading `mermaid` via dynamic import
- [X] T049 [P] [US3] Implement theme selection in the client runtime using the same `localStorage` key and `html.dark` class as `@/components/theme/ThemeProvider`, applied by an inline pre-paint script emitted in `document.tsx`
- [X] T050 [US3] Inline the deployment's appearance tokens into every document via the existing `buildUserAppearanceCss()` from `@/server/appearance/style.ts`
- [X] T051 [P] [US3] Render the in-page table of contents from `extractHeadings()` and the breadcrumb trail in `document.tsx`, reusing the reader's own components
- [X] T052 [US3] Copy the built assets into every snapshot under the reserved `_static/` prefix in `apps/web/src/server/static-site/snapshot.ts`
- [X] T053 [US3] Style `404.html` consistently with the site and give it links to the home page and search
- [ ] T054 [US3] Add `apps/web/e2e/static-site-artifact.spec.ts` serving a generated snapshot from a plain static file server **with the wiki stopped**, asserting navigation, anchor jumps, dark-mode persistence, and that code, math, diagrams, and images all render
- [ ] T093 [US3] **Rendering parity check** (gap from `/speckit.analyze`): add `apps/web/src/server/static-site/parity.test.ts` comparing the static document's body against the reader's output for the same revision, so SC-003's 100% claim is asserted rather than eyeballed
- [ ] T094 [P] [US3] **Dead-link scan** (gap from `/speckit.analyze`): assert every internal `href` in a generated snapshot resolves to a file in the artifact, covering SC-004's zero-dead-link claim

**Checkpoint**: the artifact is self-contained and visually consistent with the wiki.

---

## Phase 6: User Story 4 — Search the published site without a server (P2)

**Goal**: Chunked, browser-only, CJK-capable search.

**Independent Test**: publish a page set, disconnect from the wiki, search terms
from titles and bodies including a Chinese query, and confirm results open the
right pages.

### Tests for User Story 4

- [X] T055 [P] [US4] Write `apps/web/src/server/static-site/search-index.test.ts` asserting the index step runs over the generated HTML directory, that a missing or failing binary fails the run rather than shipping dead search, and that no ineligible page appears in the index

### Implementation for User Story 4

- [X] T056 [US4] Implement the Pagefind invocation in `apps/web/src/server/static-site/search-index.ts`, running over the generated HTML and emitting into the reserved `pagefind/` prefix
- [X] T057 [US4] Mark indexable body content in `document.tsx` so navigation and chrome are excluded from the index
- [X] T058 [P] [US4] Build the search UI in `apps/web/src/components/static-site/SearchPanel.tsx` on `@/components/ui` primitives, not the Pagefind default web component
- [X] T059 [US4] Wire the search UI to the Pagefind JS API in `apps/web/src/static-site/client/search.tsx`, reflecting query state in the URL so results are shareable and back/forward work
- [X] T060 [P] [US4] Add localized search placeholder, result-count, and empty-state strings to `apps/web/messages/en.json` and `zh.json`
- [ ] T061 [US4] Extend `apps/web/e2e/static-site-artifact.spec.ts` with search coverage including an unsegmented Chinese query, still with the wiki unreachable
- [ ] T096 [US4] **Cross-language search** (found during browser verification): Pagefind partitions its index by document `lang`, so a search currently covers only the language of the page the reader is on. Evaluate `mergeIndex` (a first attempt had no effect) or a per-language index entry point, so FR-021's "every published page" holds on multilingual sites

**Checkpoint**: readers can search without a server.

---

## Phase 7: User Story 5 — Browse the site in multiple languages (P2)

**Goal**: Every locale version reachable at its own address, with working switching.

**Independent Test**: publish a translation group of two locales plus a
single-locale page; confirm distinct addresses, two-way switching, and a
non-dead-end for the missing translation.

### Tests for User Story 5

- [X] T062 [P] [US5] Write `apps/web/src/server/static-site/navigation.locale.test.ts` asserting per-locale addresses, that the switcher offers only translations that exist, and that a missing translation produces a stub rather than a 404

### Implementation for User Story 5

- [X] T063 [US5] Emit translations at `<locale>/<path>/index.html` in `apps/web/src/server/static-site/snapshot.ts`, matching the reader route's existing locale-prefix convention
- [X] T064 [US5] Build language-switcher data per page from the translation group in `apps/web/src/server/static-site/navigation.ts`
- [X] T065 [P] [US5] Generate the missing-translation stub page linking to available versions, per FR-025
- [X] T066 [US5] Select the interface locale from the document's content locale (falling back to `defaultLocale`) in `document.tsx`, drawing strings from the existing catalogs — no site-specific translation file
- [X] T067 [US5] Set the document language attribute so the client runtime's existing `lang` observer resolves the right catalog
- [ ] T068 [US5] Extend `apps/web/e2e/static-site-artifact.spec.ts` with language switching and the missing-translation path

**Checkpoint**: the published site serves every audience the wiki serves.

---

## Phase 8: User Story 6 — Keep the public site current (P3)

**Goal**: Automatic and scheduled publishing with coalescing.

**Independent Test**: enable automatic publishing, publish a page, and confirm
the site updates with no manual action; enable scheduling and confirm a run
occurs on time.

### Tests for User Story 6

- [X] T069 [P] [US6] Write `apps/web/src/server/jobs/static-site-publish.test.ts` asserting that triggers during an active run collapse into exactly one follow-up run, and that a failed run leaves the previous delivery intact

### Implementation for User Story 6

- [X] T070 [US6] Implement trigger collapsing and the single-active-run guarantee in `apps/web/src/server/jobs/static-site-publish.ts`
- [X] T071 [US6] Mark the target stale and enqueue a republish from the existing public-content mutation paths (publish, unpublish, delete, path/title/metadata change, visibility change, space anonymous-read change), alongside the ISR revalidation those paths already perform
- [X] T072 [P] [US6] Implement the scheduled tick handler and register it in `apps/web/src/server/jobs/register.ts`, following the `tickScheduledGitExport` pattern
- [X] T073 [P] [US6] Add trigger controls (auto on change, scheduled with interval) to `apps/web/src/components/admin/static-site/TargetForm.tsx`
- [X] T074 [US6] Add run history with pagination to `apps/web/src/components/admin/static-site/PublishHistory.tsx`
- [X] T075 [P] [US6] Add `apps/web/src/server/services/static-site.history.test.ts` asserting error messages are stored redacted of credential material
- [X] T095 [P] [US6] **Independence check** (gap from `/speckit.analyze`): assert that Git export and static site publishing run without blocking, overwriting, or altering each other's target, state, or artifact — the verification FR-002 and US6 scenario 5 require

**Checkpoint**: the site follows the wiki without manual action.

---

## Phase 9: User Story 7 — Take the public site down (P3)

**Goal**: Reversibility from inside the product.

**Independent Test**: publish, take down, and confirm no further publishes occur
and previously published addresses stop serving.

### Tests for User Story 7

- [X] T076 [P] [US7] Write `apps/web/app/api/static-site/site/route.test.ts` asserting the confirmation token is required, that takedown is admin-only, and that a takedown during an active run cancels the pending rerun

### Implementation for User Story 7

- [X] T077 [US7] Implement `DELETE apps/web/app/api/static-site/site/route.ts` requiring the branch-name confirmation token and queueing a run with `trigger: 'takedown'`
- [X] T078 [US7] Implement takedown delivery in `apps/web/src/server/jobs/static-site-publish.ts`, emptying the target branch so published addresses stop serving
- [X] T079 [US7] Ensure `DELETE apps/web/app/api/static-site/target/route.ts` destroys the stored credential and cascades publication history, without touching the published site
- [X] T080 [P] [US7] Add the takedown control to the admin panel with an explicit confirmation dialog stating the public site will become unavailable — a designed dialog, never a browser `confirm()`
- [ ] T081 [US7] Extend `apps/web/e2e/static-site-publish.spec.ts` with the takedown path

**Checkpoint**: publishing is fully reversible.

---

## Phase 11: Shared integrations (from operator feedback)

Credentials were initially held per feature, which meant installing two deploy
keys on one repository — something hosts reject outright. They are now a shared
integration: configured once, used by every feature that reaches that service.

- [X] T097 Add the `integrations` table and its migration, lifting existing Git export and static site credentials into it
- [X] T098 Implement `apps/web/src/server/services/integrations.ts` with one credential per service, refusing deletion while a feature depends on it
- [X] T099 Add `/api/integrations/[kind]` and its deploy-key route
- [X] T100 Add the `/admin/integrations` surface under the System navigation group
- [X] T101 Point static site publishing at the shared credential and give its configuration provider tabs
- [ ] T102 Migrate Git export to the shared credential as well, and drop the now-legacy columns on `static_site_targets` in a follow-up migration

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T082 [P] Run `pnpm lint` and `pnpm typecheck` across the workspace and fix all warnings introduced by this feature
- [ ] T083 [P] Verify the OpenAPI spec regenerates cleanly with the new routes via `pnpm --filter @next-wiki/web openapi:generate`, checking for `@queryParams` schema-name collisions with unrelated same-named types elsewhere in the workspace
- [ ] T084 [P] Document the feature in `docs/` and cross-link it from the Git export documentation, stating explicitly that the two are different features with different artifacts
- [ ] T085 Confirm this feature introduces no change to the wiki's own public ISR representation or cache tags, and that staleness marking rides along with existing revalidation rather than adding a new tag
- [ ] T086 [P] Measure a 1,000-page snapshot end to end against the performance goals in plan.md and record the result
- [ ] T087 Verify with `docker compose up -d --build` that the pinned Pagefind binary executes on the built image, on both amd64 and arm64
- [ ] T088 Walk through [quickstart.md](./quickstart.md) end to end against a real GitHub Pages repository, including the sub-path base URL case
- [ ] T089 Re-read [spec.md](./spec.md) FR-001 through FR-038 and confirm each has a corresponding implementation and test

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; blocks all user stories. T006–T008 land as their own commit before anything depends on them
- **US1 (Phase 3)**: depends on Foundational. Delivers the MVP
- **US2 (Phase 4)**: depends on US1. T037 gates every subsequent phase
- **US3 (Phase 5)**: depends on US1; independent of US2 in code, but do not ship ahead of T037
- **US4 (Phase 6)**: depends on US1 and US3 (indexes generated HTML, ships UI in the runtime bundle)
- **US5 (Phase 7)**: depends on US1; touches `navigation.ts` and `document.tsx`, so coordinate with US3
- **US6 (Phase 8)**: depends on US1
- **US7 (Phase 9)**: depends on US1
- **Polish (Phase 10)**: depends on all shipped stories

### Critical path

`T006–T008 → T011–T012 → T014 → T026 → T027 → T030 → T031 → T037`

Everything after T037 is guarded by the disclosure assertion.

### Parallel Opportunities

- Setup: T001–T004 all parallel
- Foundational: T009/T010 parallel; T015–T018 parallel after T014; T021/T022 parallel
- US1: T023/T024 parallel; T025/T028/T029 parallel
- US2: T038, T041, T044 parallel after T037
- US3: T045/T046 parallel; T049/T051 parallel after T047
- Across stories: once US1 and US2 are done, US4, US5, US6, and US7 can proceed in parallel by different developers, with US4/US5 coordinating on `document.tsx`

---

## Parallel Example: User Story 1

```bash
# Write the failing tests together:
Task: "Write eligibility.test.ts in apps/web/src/server/static-site/"
Task: "Write paths.test.ts in apps/web/src/server/static-site/"

# Then the independent modules:
Task: "Implement paths.ts in apps/web/src/server/static-site/"
Task: "Implement navigation.ts in apps/web/src/server/static-site/"
Task: "Implement assets.ts in apps/web/src/server/static-site/"
```

---

## Implementation Strategy

### MVP (US1 only)

Phases 1 → 2 → 3. Stop and validate: a configured target publishes a browsable
site whose content is filtered by all five eligibility conditions. Demo-able.

**Do not deploy the MVP against a real public repository before Phase 4.** US1
implements the filter; US2 proves it. Until T037 passes, non-disclosure is
believed rather than known, and the artifact is irreversibly public.

### Incremental delivery

1. Setup + Foundational → target configurable
2. US1 → site published (MVP)
3. US2 → non-disclosure proven → **safe to point at a real public repository**
4. US3 → parity, dark mode, self-containment
5. US4 → search
6. US5 → multilingual
7. US6 → automatic and scheduled publishing
8. US7 → takedown

### Parallel team strategy

Setup and Foundational together. One developer carries US1 → US2 (the critical
path). Once T037 is green, US3–US7 distribute across the team, with US4 and US5
coordinating on `document.tsx`.

---

## Notes

- Commit after each task or logical group; keep refactoring and feature work in
  separate commits (T006–T008 are refactor-only)
- Every new module gets unit tests; the constitution requires them for
  permission- and public-API-touching features
- Verify tests fail before implementing
- Stop any preview or manually started dev server before running the e2e suite —
  leftover servers starve it of CPU and produce failures that look like
  regressions
- Never use `TRUNCATE ... CASCADE` in reset specs
- Schema changes only via `pnpm db:generate`, verified by a second clean run
