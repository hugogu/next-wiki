# Tasks: Configurable Space Publication

**Input**: Design documents from specs/032-space-publication/
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Tests**: Required by the project rules and feature acceptance criteria. Add the relevant unit, integration, and browser coverage before considering each story complete.

## Phase 1: Test Setup

**Purpose**: Establish reusable coverage for the feature contracts.

- [ ] T001 [P] Add route-prefix validation and canonical/legacy URL fixtures in apps/web/src/server/services/space-routes.test.ts
- [ ] T002 [P] Add end-to-end publication, space-settings, link-retirement, and cross-space-search journeys in apps/web/e2e/space-publication.spec.ts

---

## Phase 2: Foundational Data, Routing, and Authorization

**Purpose**: Build the shared persistence, routing, cache, and permission primitives required by every user story.

**CRITICAL**: No user story is complete until this phase is complete.

- [ ] T003 Extend the spaces schema with route_prefix and default_visibility, and add space_route_aliases, page_route_redirects, and retired_link_pages tables in apps/web/src/server/db/schema/index.ts
- [ ] T004 Generate the Drizzle migration and snapshot for the schema changes with pnpm db:generate in apps/web/src/server/db/migrations/
- [ ] T005 [P] Implement validation for non-empty, reserved-segment-safe, and unique current or historical route prefixes in apps/web/src/server/services/space-routes.ts
- [ ] T006 [P] Implement canonical public URL resolution, workspace URL resolution, prefix-alias lookup, and opaque legacy-route eligibility checks in apps/web/src/server/services/space-routes.ts
- [ ] T007 Extend cached space lookup, administrative space updates, and cache invalidation for route configuration in apps/web/src/server/services/spaces.ts
- [ ] T008 Replace the closed ReaderSpace route assumptions with configured-space URL helpers in apps/web/src/lib/path.ts
- [ ] T009 Update public cache tags and invalidation fan-out for page visibility, space prefixes, aliases, redirects, and retired link records in apps/web/src/server/cache/public-cache.ts
- [ ] T010 Update page read models to expose page visibility, owning space, and canonical route inputs without treating a link page as a publishable page in apps/web/src/server/services/pages.ts
- [ ] T011 Separate read authorization from raw/generated authoring restrictions so public published pages can be read while source-space writes remain restricted in apps/web/src/server/permissions/index.ts
- [ ] T012 Preserve protection of raw source bytes and file downloads regardless of page visibility in apps/web/src/server/services/raw-markdown-export.ts
- [ ] T013 Add schema-backed service tests for prefix uniqueness, aliases, redirect eligibility, invalidation, and raw/generated read permissions in apps/web/src/server/services/space-routes.test.ts
- [ ] T014 Add migration regression coverage for existing wiki, generated, raw, and historical link-page records in apps/web/src/server/db/schema/index.test.ts
- [ ] T015 Verify the generated migration is clean by rerunning pnpm db:generate and confirming no additional schema change is detected

**Checkpoint**: Space and page route state is persistable, resolvable, cache-safe, and authorization-correct.

---

## Phase 3: User Story 1 - Publish a Reviewed Page from Any Space (Priority: P1) MVP

**Goal**: Editors and admins can make a reviewed page public in any enabled space, and anonymous readers receive only public published content at the configured prefix.

**Independent Test**: Configure a non-Wiki space prefix, mark one published page public, and verify its canonical URL returns static public content while unpublished or restricted siblings return 404.

- [ ] T016 [P] [US1] Add public-page eligibility tests for enabled spaces, published revisions, and page visibility in apps/web/src/server/services/public-content.test.ts
- [ ] T017 [P] [US1] Add public reader route tests for configured prefixes, localized paths, metadata, canonical URLs, and 404 behavior in apps/web/app/(public)/[...path]/page.test.tsx
- [ ] T018 [P] [US1] Add public page visibility update API tests in apps/web/app/api/pages/[pageId]/visibility/route.test.ts
- [ ] T019 [US1] Extend public content lookup to resolve any enabled space by configured prefix and require public visibility plus a published revision in apps/web/src/server/services/public-content.ts
- [ ] T020 [US1] Replace the Wiki-only public catch-all resolution with canonical configured-space prefix resolution, including locale fallback, in apps/web/app/(public)/[...path]/page.tsx
- [ ] T021 [US1] Render canonical URL, robots, Open Graph, and alternate-language metadata from the resolved space prefix in apps/web/app/(public)/[...path]/page.tsx
- [ ] T022 [US1] Add a page visibility mutation route that permits only Editor or Admin roles and invalidates public content safely in apps/web/app/api/pages/[pageId]/visibility/route.ts
- [ ] T023 [US1] Add the editor/admin page-header visibility control using existing UI primitives in apps/web/src/components/pages/PageVisibilityControl.tsx
- [ ] T024 [US1] Place the page visibility control in the private reader header without consuming article reading space in apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx
- [ ] T025 [US1] Update sitemap entry generation to include canonical routes for public pages in every enabled space and exclude all other pages in apps/web/app/sitemap.ts
- [ ] T026 [US1] Add static-render and cache-invalidation regression coverage for public pages in apps/web/e2e/space-publication.spec.ts

**Checkpoint**: A public published page can be read anonymously through its space prefix; no restricted, unpublished, disabled-space, or raw-byte content leaks.

---

## Phase 4: User Story 2 - Configure and Navigate Peer Spaces (Priority: P1)

**Goal**: Administrators manage peer-space names, non-empty prefixes, enabled state, and default visibility. Readers and editors use the configured paths, and writing-mode changes preserve Wiki paths while safely migrating source-space URLs.

**Independent Test**: Change the generated prefix to g, confirm configured navigation and public URLs use it, switch writing mode off and on, and verify /g/concepts/payment safely redirects only when its migrated Wiki page is public and published.

- [ ] T027 [P] [US2] Add settings API tests for list/update permissions, non-empty prefix validation, reserved names, collisions, aliases, and disabled spaces in apps/web/app/api/settings/spaces/route.test.ts
- [ ] T028 [P] [US2] Add writing-mode migration tests for source-directory migration, retained inactive configuration, and conditional public legacy redirects in apps/web/src/server/jobs/writing-mode-switch.test.ts
- [ ] T029 [P] [US2] Add route helper tests for configurable workspace links and navigation labels in apps/web/src/lib/path.test.ts
- [ ] T030 [US2] Implement the authenticated administrator GET and update endpoints for all space settings and prefix changes in apps/web/app/api/settings/spaces/route.ts
- [ ] T031 [US2] Implement per-space update validation and alias creation for renamed prefixes in apps/web/app/api/settings/spaces/[spaceId]/route.ts
- [ ] T032 [US2] Add the administrator space-settings page and navigation entry in apps/web/app/(admin)/admin/spaces/page.tsx
- [ ] T033 [US2] Build the reusable space configuration list, edit form, visibility-default selector, validation feedback, and safe rename confirmation in apps/web/src/components/admin/spaces/SpaceSettingsPanel.tsx
- [ ] T034 [US2] Replace literal raw/generated workspace routes with resolved configured-space routes while retaining authenticated workspace access in apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx
- [ ] T035 [US2] Update space navigation, breadcrumbs, page creation, move, and return-link callers to use configured route helpers in apps/web/src/components/spaces/SpaceNavigation.tsx
- [ ] T036 [US2] Update page creation and move services to apply a space default visibility only when a page has no explicit visibility choice in apps/web/src/server/services/pages.ts
- [ ] T037 [US2] Update the writing-mode switch job to migrate generated and raw paths beneath the Wiki source-space directories, preserve their stored configurations while inactive, and create migration redirect records in apps/web/src/server/jobs/writing-mode-switch.ts
- [ ] T038 [US2] Resolve old source-space routes as redirects only when the migrated target remains public and published, returning an indistinguishable 404 otherwise, in apps/web/src/server/services/space-routes.ts
- [ ] T039 [US2] Add browser coverage for prefix rename aliases, configured navigation, disabled spaces, defaults, and LLM writing-mode transitions in apps/web/e2e/space-publication.spec.ts

**Checkpoint**: Spaces are peer-configurable and unambiguous; no root/default prefix exists, and mode changes do not expose private migration history.

---

## Phase 5: User Story 3 - Use One Page Model Without Link Pages (Priority: P1)

**Goal**: The publish-as-link workflow is removed. Historical link pages remain auditable but cannot be created, searched, resolved, or exposed through public routes.

**Independent Test**: Attempt every former publish-as-link entry point and API, confirm no new link page is created, and confirm a historical link URL gives a safe redirect only when its target is public and published.

- [ ] T040 [P] [US3] Add service tests proving new link-page creation and link resolution are rejected while historical audit records remain readable to authorized users in apps/web/src/server/services/link-pages.test.ts
- [ ] T041 [P] [US3] Add API and OpenAPI contract tests for removal of publish-as-link endpoints and link-page payload fields in apps/web/app/api/pages/route.test.ts
- [ ] T042 [P] [US3] Add reader tests for historical link route redirect versus opaque 404 behavior in apps/web/app/(public)/[...path]/page.test.tsx
- [ ] T043 [US3] Replace link-page creation and materialization with retirement and historical-record handling in apps/web/src/server/services/link-pages.ts
- [ ] T044 [US3] Remove link-target resolution from page reads, mutations, revision publication, and public-content lookups in apps/web/src/server/services/pages.ts
- [ ] T045 [US3] Remove link-page target traversal and link-related revalidation paths from apps/web/src/server/services/revisions.ts
- [ ] T046 [US3] Remove link-page publication controls, dialogs, and provenance actions from apps/web/src/components/pages/PublishLinkButton.tsx
- [ ] T047 [US3] Remove publish-as-link and link-target UI entry points from private page and space readers in apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx
- [ ] T048 [US3] Remove link-page creation and lookup operations from page API routes and shared request schemas in apps/web/app/api/pages/route.ts
- [ ] T049 [US3] Remove link-page tools, payload shapes, and search/result handling from the MCP server in packages/mcp-server/src/index.ts
- [ ] T050 [US3] Remove link-page fields and operations from generated API documentation source in apps/web/src/server/openapi/pages.ts
- [ ] T051 [US3] Replace historical public link handling with a target-page redirect only for an eligible public published target in apps/web/src/server/services/space-routes.ts
- [ ] T052 [US3] Remove publish-as-link translations and obsolete link-page copy from apps/web/messages/en.json
- [ ] T053 [US3] Remove publish-as-link translations and obsolete link-page copy from apps/web/messages/zh.json
- [ ] T054 [US3] Add browser regression coverage that historical link routes do not leak target names or visibility state in apps/web/e2e/space-publication.spec.ts

**Checkpoint**: There is one normal page model; link history is retained safely but has no creation, discovery, search, or public-content surface.

---

## Phase 6: User Story 4 - Search and Read Across Spaces Consistently (Priority: P2)

**Goal**: Search, navigation, AI/MCP results, imports/exports, and public APIs show canonical configured-space URLs and do not surface retired link pages.

**Independent Test**: Search mixed Wiki/raw/generated content and verify each eligible result opens its configured canonical route, while retired link pages and non-public pages never appear to anonymous users.

- [ ] T055 [P] [US4] Add mixed-space search and canonical result URL tests, including retired-link exclusion, in apps/web/src/server/services/search.test.ts
- [ ] T056 [P] [US4] Add public API contract tests for configured canonical paths, visibility filtering, and retired-link exclusion in apps/web/app/api/v1/pages/route.test.ts
- [ ] T057 [P] [US4] Add MCP result-shape tests for configured canonical paths and no link-page results in packages/mcp-server/src/index.test.ts
- [ ] T058 [US4] Update authenticated and public search query filters to exclude retired link pages and attach canonical configured-space paths in apps/web/src/server/services/search.ts
- [ ] T059 [US4] Update search result links, page preview links, and result metadata to use canonical route helpers in apps/web/src/components/search/SearchResults.tsx
- [ ] T060 [US4] Update public Wiki API page and search serializers to resolve configured prefixes and filter by public eligibility in apps/web/app/api/v1/pages/route.ts
- [ ] T061 [US4] Update MCP page/search serializers to emit canonical configured-space routes and omit retired link pages in packages/mcp-server/src/index.ts
- [ ] T062 [US4] Update AI retrieval and image-generation page references to use canonical page identities rather than link targets in apps/web/src/server/services/ai-image-generation.ts
- [ ] T063 [US4] Update import/export page traversal to preserve space identity while excluding retired link pages from normal exports in apps/web/src/server/services/transfers/export.ts
- [ ] T064 [US4] Update wiki static-site publishing eligibility and generated route manifests to remain Wiki-only while using the configured Wiki prefix in apps/web/src/server/services/static-sites.ts
- [ ] T065 [US4] Add browser coverage for cross-space search result URLs and anonymous search exclusion in apps/web/e2e/space-publication.spec.ts

**Checkpoint**: All supported readers and integrations agree on a page’s canonical space-aware URL and no feature resurrects link pages.

---

## Phase 7: Polish and Cross-Cutting Verification

**Purpose**: Complete documentation, generated artifacts, and full regression verification.

- [ ] T066 [P] Update public-routing, space-settings, and deprecation contract examples to match final endpoint and route behavior in specs/032-space-publication/contracts/public-routing.md
- [ ] T067 [P] Update the feature quickstart with actual commands, configured-prefix examples, and manual migration checks in specs/032-space-publication/quickstart.md
- [ ] T068 [P] Remove obsolete publish-as-link documentation and update public-space terminology in apps/web/README.md
- [ ] T069 Regenerate API documentation after endpoint and schema changes with the project next-open-api command in apps/web
- [ ] T070 Run pnpm lint and resolve warnings in apps/web
- [ ] T071 Run pnpm test for the web application and resolve feature regressions in apps/web
- [ ] T072 Run pnpm build to verify public/static routing, route handlers, and generated API artifacts in apps/web
- [ ] T073 Run the focused browser suite in apps/web/e2e/space-publication.spec.ts against the Docker Compose test environment
- [ ] T074 Re-run the quickstart acceptance checks in specs/032-space-publication/quickstart.md and record any intentional implementation deviations in specs/032-space-publication/plan.md

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks all user stories.
- User Story 1 depends on Phase 2 and is the MVP.
- User Story 2 depends on Phase 2; its configured routes and migration redirects extend the public resolver completed by User Story 1.
- User Story 3 depends on Phase 2 and may proceed in parallel with User Story 2 after the foundational route resolver is stable.
- User Story 4 depends on User Stories 1 through 3 because it consumes canonical URLs, public eligibility, configured navigation, and link retirement.
- Phase 7 depends on all selected user stories.

### User Story Dependency Graph

~~~text
Foundational
    └── US1: Public page eligibility and reader
          ├── US2: Space settings, navigation, and writing-mode migration
          └── US3: Retire link pages
                └── US4: Search, APIs, MCP, export, and static-site consistency
~~~

### Parallel Opportunities

- T001 and T002 can be prepared independently.
- T005, T006, T013, and T014 touch distinct services/tests once the schema shape is agreed.
- Within US1, T016 through T018 can be written in parallel before T019 through T025.
- Within US2, T027 through T029 can be written in parallel; settings UI and workspace navigation can proceed in parallel after T030 and T031.
- Within US3, T040 through T042 can be written in parallel; UI, API, MCP, and translation removal can proceed in parallel after the retirement service is stable.
- Within US4, T055 through T057 can be written in parallel; search, public API, MCP, AI, export, and static-site changes can be divided by file ownership after the canonical helper is complete.
- T066 through T068 can run in parallel with final verification preparation.

---

## Parallel Example: User Story 3

~~~text
Task: T046 Remove page-level publish-as-link UI in apps/web/src/components/pages/PublishLinkButton.tsx
Task: T048 Remove link API operations in apps/web/app/api/pages/route.ts
Task: T049 Remove MCP link tools in packages/mcp-server/src/index.ts
Task: T052 Remove English copy in apps/web/messages/en.json
Task: T053 Remove Chinese copy in apps/web/messages/zh.json
~~~

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phases 1 and 2.
2. Complete T016 through T026.
3. Verify a public published page in an enabled non-Wiki space is independently reachable at its configured prefix and all non-eligible variants are 404.
4. Demo or deploy this increment before taking on administrative configuration and link retirement.

### Incremental Delivery

1. Deliver public visibility from all spaces (US1).
2. Deliver administrator configuration, configured navigation, and writing-mode-safe migration (US2).
3. Remove publish-as-link and safely retain only its historical audit/redirect behavior (US3).
4. Align search, APIs, MCP, export, and static-site behavior (US4).
5. Finish documentation and full regression verification.

### Task Count Summary

- Total tasks: 74
- Setup: 2
- Foundational: 13
- US1: 11
- US2: 13
- US3: 15
- US4: 11
- Polish: 9
- Parallelizable tasks: 19
