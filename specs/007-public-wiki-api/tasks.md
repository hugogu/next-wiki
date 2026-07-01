# Tasks: Public Wiki Content API

**Input**: Design documents from `/specs/007-public-wiki-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

**Tests**: Included because the specification requires authorization, leakage, behavior-equivalence, documentation, audit, and complete workflow verification.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as an independently useful increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after earlier dependencies in the same phase are complete
- **[Story]**: User story label from spec.md
- Every task includes the primary file path to change or create

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared public API scaffolding without implementing story behavior.

- [X] T001 Add shared public page/revision schema scaffolding and exports in `packages/shared/src/pages.ts`
- [X] T002 [P] Add shared public asset schema scaffolding and exports in `packages/shared/src/content-storage.ts`
- [X] T003 [P] Add public wiki API E2E fixture helpers for users, keys, pages, and assets in `apps/web/test/public-wiki-api-fixtures.ts`
- [X] T004 Add `/api/v1` route adapter helper for actor resolution, JSON parsing, audit wrapping, and service invocation in `apps/web/app/api/v1/_shared/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core contract, adapter, and service infrastructure that all public content routes depend on.

**CRITICAL**: No user story implementation should start until these tasks are complete.

- [X] T005 Implement stable public API error code mapping in `apps/web/src/server/api/public-errors.ts`
- [X] T006 [P] Implement bounded cursor/limit pagination helpers for public lists in `apps/web/src/server/api/public-pagination.ts`
- [X] T007 Create the public content DTO facade skeleton over existing page, revision, asset, and permission services in `apps/web/src/server/services/public-content.ts`
- [X] T008 Add architecture tests proving `/api/v1` routes do not import existing internal route handlers or own business logic in `apps/web/app/api/v1/public-route-architecture.test.ts`
- [X] T009 Register initial public API schema names for next-openapi-gen in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T010 Export shared public API schemas from the package barrel in `packages/shared/src/index.ts`

**Checkpoint**: Public API foundation is ready; user story work can proceed.

---

## Phase 3: User Story 1 - Read Wiki Content Externally (Priority: P1) MVP

**Goal**: External tools can list readable pages and retrieve page metadata plus Markdown source through stable `/api/v1` endpoints.

**Independent Test**: Create Reader, Editor, and Admin API keys; list pages and read one page by id/path; confirm drafts and protected pages are hidden from unauthorized keys.

### Tests for User Story 1

- [X] T011 [P] [US1] Add route tests for `GET /api/v1/pages`, `GET /api/v1/pages/{id}`, and `GET /api/v1/pages/by-path/{path}` in `apps/web/app/api/v1/pages/public-pages-read-routes.test.ts`
- [X] T012 [P] [US1] Add service tests for readable page DTOs, Markdown source visibility, and hidden drafts in `apps/web/src/server/services/public-content-read.test.ts`
- [X] T013 [P] [US1] Add E2E read workflow covering Reader, Editor, and Admin API keys in `apps/web/e2e/public-wiki-api-read.spec.ts`

### Implementation for User Story 1

- [X] T014 [US1] Implement `PublicPageResource`, `PublicRevisionResource`, list query, by-path query, and read response schemas in `packages/shared/src/pages.ts`
- [X] T015 [US1] Implement list/read/page-source DTO mapping over existing page services in `apps/web/src/server/services/public-content.ts`
- [X] T016 [US1] Implement `GET /api/v1/pages` using the shared route adapter and public content service in `apps/web/app/api/v1/pages/route.ts`
- [X] T017 [P] [US1] Implement `GET /api/v1/pages/{id}` using the shared route adapter and public content service in `apps/web/app/api/v1/pages/[id]/route.ts`
- [X] T018 [P] [US1] Implement `GET /api/v1/pages/by-path/{...path}` using canonical path decoding in `apps/web/app/api/v1/pages/by-path/[...path]/route.ts`
- [X] T019 [US1] Add read endpoint OpenAPI metadata and exported schemas for next-openapi-gen in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T020 [US1] Add public content read URL helpers for first-party client migration in `apps/web/src/lib/path.ts`
- [X] T021 [US1] Regenerate the OpenAPI document with read endpoints present in `apps/web/public/openapi.json`

**Checkpoint**: US1 is independently usable as the MVP read-only public wiki API.

---

## Phase 4: User Story 2 - Create, Update, and Publish Content (Priority: P1)

**Goal**: Editor/Admin API keys can create pages, save Markdown drafts, update properties, list/read revisions, and publish revisions without Reader write access.

**Independent Test**: With an Editor key, create a page, save Markdown, publish it, update it, publish a later revision, and confirm Reader visibility changes only after publication.

### Tests for User Story 2

- [X] T022 [P] [US2] Add route tests for create, draft, properties, revision history, revision detail, publish, Reader denial, and stale conflicts in `apps/web/app/api/v1/pages/public-pages-write-routes.test.ts`
- [X] T023 [P] [US2] Add service tests for public create/draft/property/publish DTOs and stale revision guards in `apps/web/src/server/services/public-content-write.test.ts`
- [X] T024 [P] [US2] Add E2E create-draft-publish-update-history workflow with Reader/Editor keys in `apps/web/e2e/public-wiki-api-write.spec.ts`

### Implementation for User Story 2

- [X] T025 [US2] Implement public create, draft, properties, revision list, revision detail, and publication schemas in `packages/shared/src/pages.ts`
- [X] T026 [US2] Add base revision conflict checks for public draft and property updates in `apps/web/src/server/services/pages.ts`
- [X] T027 [US2] Add expected revision validation for public publication in `apps/web/src/server/services/revisions.ts`
- [X] T028 [US2] Implement public create, draft, properties, revision, and publish facade methods in `apps/web/src/server/services/public-content.ts`
- [X] T029 [US2] Implement `POST /api/v1/pages` in the existing public pages route file in `apps/web/app/api/v1/pages/route.ts`
- [X] T030 [P] [US2] Implement `POST /api/v1/pages/{id}/drafts` in `apps/web/app/api/v1/pages/[id]/drafts/route.ts`
- [X] T031 [P] [US2] Implement `PATCH /api/v1/pages/{id}/properties` in `apps/web/app/api/v1/pages/[id]/properties/route.ts`
- [X] T032 [P] [US2] Implement `GET /api/v1/pages/{id}/revisions` in `apps/web/app/api/v1/pages/[id]/revisions/route.ts`
- [X] T033 [P] [US2] Implement `GET /api/v1/pages/{id}/revisions/{version}` in `apps/web/app/api/v1/pages/[id]/revisions/[version]/route.ts`
- [X] T034 [P] [US2] Implement `POST /api/v1/pages/{id}/revisions/{version}/publication` in `apps/web/app/api/v1/pages/[id]/revisions/[version]/publication/route.ts`
- [X] T035 [US2] Add write/revision/publication endpoint OpenAPI metadata and schemas in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T036 [US2] Update first-party create page client calls to prefer `POST /api/v1/pages` in `apps/web/src/components/pages/CreatePageForm.tsx`
- [X] T037 [US2] Update first-party publish button calls to prefer `/api/v1` publication endpoints in `apps/web/src/components/pages/PublishButton.tsx`
- [X] T038 [US2] Update header publish calls to prefer `/api/v1` publication endpoints in `apps/web/src/components/layout/Header.tsx`
- [X] T039 [US2] Update page edit, history, revision, and properties URL helpers to prefer public content APIs in `apps/web/src/lib/path.ts`
- [X] T040 [US2] Regenerate the OpenAPI document with write, history, and publish endpoints present in `apps/web/public/openapi.json`

**Checkpoint**: US1 and US2 together provide core Wiki.js replacement automation for pages and revisions.

---

## Phase 5: User Story 3 - Manage Assets for Page Automation (Priority: P2)

**Goal**: Editor/Admin API keys can upload supported assets and receive stable metadata plus Markdown-ready references that obey page visibility.

**Independent Test**: Upload an image with an Editor key, insert the returned Markdown into a draft, publish the page, and verify Reader access follows page readability.

### Tests for User Story 3

- [X] T041 [P] [US3] Add route tests for asset upload, metadata read, content streaming, unsupported type, oversized file, and Reader denial in `apps/web/app/api/v1/assets/public-assets-routes.test.ts`
- [X] T042 [P] [US3] Add service permission tests for public asset metadata/content visibility through page references in `apps/web/src/server/services/public-content-assets.test.ts`
- [X] T043 [P] [US3] Add E2E asset upload, Markdown insertion, publication, and Reader content access workflow in `apps/web/e2e/public-wiki-api-assets.spec.ts`

### Implementation for User Story 3

- [X] T044 [US3] Implement `PublicAssetResource` and public asset upload response schemas in `packages/shared/src/content-storage.ts`
- [X] T045 [US3] Implement public asset DTO mapping and visibility checks over existing asset services in `apps/web/src/server/services/public-content.ts`
- [X] T046 [US3] Extend content asset service methods only where needed for public metadata/content reuse in `apps/web/src/server/services/content-assets.ts`
- [X] T047 [US3] Implement `POST /api/v1/assets` using multipart parsing and shared upload service in `apps/web/app/api/v1/assets/route.ts`
- [X] T048 [P] [US3] Implement `GET /api/v1/assets/{id}` metadata reads in `apps/web/app/api/v1/assets/[id]/route.ts`
- [X] T049 [P] [US3] Implement `GET /api/v1/assets/{id}/content` byte streaming in `apps/web/app/api/v1/assets/[id]/content/route.ts`
- [X] T050 [US3] Update the first-party editor image upload helper to prefer `POST /api/v1/assets` in `apps/web/src/lib/api/assets.ts`
- [X] T051 [US3] Add asset endpoint OpenAPI metadata and schemas in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T052 [US3] Regenerate the OpenAPI document with asset endpoints present in `apps/web/public/openapi.json`

**Checkpoint**: Public page automation supports Markdown images/files through permission-safe asset APIs.

---

## Phase 6: User Story 4 - Search and Audit External Operations (Priority: P2)

**Goal**: External tools can search readable pages, public API calls are auditable without content leakage, and generated API documentation exposes all supported workflows.

**Independent Test**: Search by path/title/content using API keys, run create-update-publish calls, inspect audit history, and verify `/api/openapi.json` and `/api-docs` contain the public resources.

### Tests for User Story 4

- [X] T053 [P] [US4] Add route tests for permission-safe page search by path, title, content, status, and pagination in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`
- [X] T054 [P] [US4] Add audit tests proving public API calls record actor, key, route, status, and sanitized errors without source bodies in `apps/web/src/server/services/public-content-audit.test.ts`
- [X] T055 [P] [US4] Add E2E search, audit, and API docs workflow in `apps/web/e2e/public-wiki-api-search-audit.spec.ts`

### Implementation for User Story 4

- [X] T056 [US4] Implement `PublicSearchResult`, search query, and search response schemas in `packages/shared/src/pages.ts`
- [X] T057 [US4] Implement permission-filtered public page search over existing readable page data in `apps/web/src/server/services/public-content.ts`
- [X] T058 [US4] Implement `GET /api/v1/search/pages` using the shared route adapter and public content service in `apps/web/app/api/v1/search/pages/route.ts`
- [X] T059 [US4] Ensure the shared `/api/v1` route adapter records sanitized audit entries for success, denial, validation failure, and server errors in `apps/web/app/api/v1/_shared/route.ts`
- [X] T060 [US4] Add search, common error, and audit-related OpenAPI metadata and schemas in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T061 [US4] Extend API documentation E2E coverage to assert `/api/v1` resources appear in `/api-docs` in `apps/web/e2e/api-docs.spec.ts`
- [X] T062 [US4] Regenerate the OpenAPI document with search and complete public content workflows present in `apps/web/public/openapi.json`

**Checkpoint**: Public content automation is discoverable, searchable, and accountable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify cross-story behavior, remove drift, and make the feature ready for implementation handoff.

- [X] T063 [P] Add full public API smoke workflow covering create, write Markdown, upload asset, publish, query, update, and history in `apps/web/e2e/public-wiki-api.spec.ts`
- [X] T064 [P] Add regression tests that compare public API and existing browser/internal workflow outcomes for permissions, validation, revision creation, publication, search visibility, and asset visibility in `apps/web/e2e/public-wiki-api-equivalence.spec.ts`
- [X] T065 Update quickstart validation notes after implementation details settle in `specs/007-public-wiki-api/quickstart.md`
- [ ] T066 Run typecheck, lint, unit tests, E2E tests, OpenAPI generation, and Docker Compose verification, then record results in `specs/007-public-wiki-api/tasks.md`

---

## Phase 8: User Story 5 - MCP Server (Priority: P2)

**Goal**: Provide an MCP Server package (`@next-wiki/mcp-server`) that exposes the v1 REST API as MCP tools and resources for AI-native clients (Claude Desktop, Cursor).

**Independent Test**: Configure the MCP Server with an Editor API key, connect from an MCP-compatible client, search pages, read content, create a page with an uploaded image, publish it, and verify through both MCP tools and the web UI.

### Setup

- [ ] T067 Create `packages/mcp-server/` package scaffold: `package.json`, `tsconfig.json`, `src/index.ts` stdio entry point, and add to pnpm workspace in `packages/mcp-server/package.json`
- [ ] T068 [P] Add `@modelcontextprotocol/sdk` dependency and configure build (tsup or tson) for ESM + CJS dual output in `packages/mcp-server/package.json`
- [ ] T069 [P] Add shared MCP tool shape types and response transformation helpers in `packages/mcp-server/src/shapes.ts`

### API Client Layer

- [ ] T070 Implement thin HTTP client wrapping all v1 REST endpoints with typed responses in `packages/mcp-server/src/api-client.ts`
- [ ] T071 [P] Add unit tests for the API client covering auth header injection, error mapping, and pagination in `packages/mcp-server/src/api-client.test.ts`

### Read Tools

- [ ] T072 [P] [US5] Implement `search_wiki` tool mapping to `GET /v1/search/pages` in `packages/mcp-server/src/tools/search-wiki.ts`
- [ ] T073 [P] [US5] Implement `list_pages` tool mapping to `GET /v1/pages` in `packages/mcp-server/src/tools/list-pages.ts`
- [ ] T074 [P] [US5] Implement `get_page` tool mapping to `GET /v1/pages/{id}` in `packages/mcp-server/src/tools/get-page.ts`
- [ ] T075 [P] [US5] Implement `list_revisions` tool mapping to `GET /v1/pages/{id}/revisions` in `packages/mcp-server/src/tools/list-revisions.ts`
- [ ] T076 [P] [US5] Implement `get_revision` tool mapping to `GET /v1/pages/{id}/revisions/{version}` in `packages/mcp-server/src/tools/get-revision.ts`

### Write Tools

- [ ] T077 [US5] Implement `create_page` tool mapping to `POST /v1/pages` in `packages/mcp-server/src/tools/create-page.ts`
- [ ] T078 [P] [US5] Implement `save_draft` tool mapping to `POST /v1/pages/{id}/drafts` in `packages/mcp-server/src/tools/save-draft.ts`
- [ ] T079 [P] [US5] Implement `update_page_properties` tool mapping to `PATCH /v1/pages/{id}` in `packages/mcp-server/src/tools/update-properties.ts`
- [ ] T080 [P] [US5] Implement `publish_page` tool mapping to `POST /v1/pages/{id}/revisions/{version}/publication` in `packages/mcp-server/src/tools/publish-page.ts`

### Asset Tool

- [ ] T081 [US5] Implement `upload_image` tool mapping to `POST /v1/assets` with base64-to-multipart encoding in `packages/mcp-server/src/tools/upload-image.ts`

### Resources

- [ ] T082 [US5] Implement MCP resource handler for `wiki://pages/{id}` URI scheme in `packages/mcp-server/src/resources/wiki-page.ts`
- [ ] T083 [P] [US5] Implement resource list handler returning all readable pages in `packages/mcp-server/src/resources/wiki-page.ts`

### Server Registration & Entry Point

- [ ] T084 [US5] Register all tools and resources on the MCP Server instance, configure stdio transport, and read API key from env in `packages/mcp-server/src/server.ts`
- [ ] T085 [US5] Wire stdio entry point and CLI arg parsing (`--api-key`, `--api-url`) in `packages/mcp-server/src/index.ts`

### Tests

- [ ] T086 [P] [US5] Add unit tests for each tool's parameter validation, REST mapping, and response shape transformation in `packages/mcp-server/src/tools/*.test.ts`
- [ ] T087 [P] [US5] Add unit tests for resource handler covering readable/unreadable pages and Markdown source in `packages/mcp-server/src/resources/wiki-page.test.ts`
- [ ] T088 [US5] Add integration test that starts a mock v1 API server, connects the MCP Server via in-memory transport, and exercises the full search → read → create → upload → publish workflow in `packages/mcp-server/src/integration.test.ts`

### Documentation

- [ ] T089 [US5] Write `packages/mcp-server/README.md` with configuration guides for Claude Desktop, Cursor, and generic MCP clients
- [ ] T090 [US5] Update `specs/007-public-wiki-api/quickstart.md` with MCP Server configuration and usage examples

**Checkpoint**: AI-native clients can interact with wiki content through MCP tools with zero REST knowledge.

---

## Phase 9: Final Verification (Updated)

- [ ] T091 Run typecheck, lint, and unit tests for the MCP Server package: `pnpm --filter @next-wiki/mcp-server typecheck && pnpm --filter @next-wiki/mcp-server lint && pnpm --filter @next-wiki/mcp-server test`
- [ ] T092 Run full monorepo verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] T093 Run Docker Compose verification with the MCP Server package included: `docker compose up -d --build && docker compose ps`
- [ ] T094 Record final verification results in `specs/007-public-wiki-api/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories
- **US1 Read API (Phase 3)**: Depends on Foundational; recommended MVP
- **US2 Write/Publish API (Phase 4)**: Depends on Foundational and benefits from US1 DTO/read paths
- **US3 Asset API (Phase 5)**: Depends on Foundational and can run after US1 read visibility is available
- **US4 Search/Audit/Docs (Phase 6)**: Depends on Foundational; search benefits from US1 readable-page DTOs and audit benefits from all route adapter use
- **Polish (Phase 7)**: Depends on all desired user stories (US1–US4)
- **MCP Server (Phase 8)**: Depends on Phases 1–7 (v1 REST API must be implemented and stable)
- **Final Verification (Phase 9)**: Depends on all phases

### User Story Dependencies

- **US1 (P1)**: Required MVP; no dependency on other stories after foundation
- **US2 (P1)**: Can start after foundation, but should integrate with US1 resource/revision schemas
- **US3 (P2)**: Can start after foundation; asset visibility tests are easier after US1/US2 publication paths exist
- **US4 (P2)**: Can start after foundation; complete audit/docs checks require routes from US1-US3
- **US5 (P2)**: Depends on all v1 REST endpoints (US1–US4) being implemented; MCP tools are thin clients over those endpoints

### Implementation Order

1. Complete Phase 1 and Phase 2.
2. Complete US1 and validate read-only external access.
3. Complete US2 and validate create/draft/publish/history.
4. Complete US3 and validate asset upload/reference/read.
5. Complete US4 and validate search, audit, and docs.
6. Complete cross-story smoke and equivalence checks (Phase 7).
7. Complete US5 MCP Server and validate with an MCP-compatible client (Phase 8).
8. Run final verification across all packages (Phase 9).

---

## Parallel Execution Examples

### User Story 1

```bash
Task: "T011 route tests in apps/web/app/api/v1/pages/public-pages-read-routes.test.ts"
Task: "T012 service tests in apps/web/src/server/services/public-content-read.test.ts"
Task: "T013 E2E read workflow in apps/web/e2e/public-wiki-api-read.spec.ts"
```

After T016 is complete, T017 and T018 can be implemented in parallel because they create different route files.

### User Story 2

```bash
Task: "T022 route tests in apps/web/app/api/v1/pages/public-pages-write-routes.test.ts"
Task: "T023 service tests in apps/web/src/server/services/public-content-write.test.ts"
Task: "T024 E2E write workflow in apps/web/e2e/public-wiki-api-write.spec.ts"
```

After T028 is complete, T030, T031, T032, T033, and T034 can be implemented in parallel because each route is in a separate file.

### User Story 3

```bash
Task: "T041 route tests in apps/web/app/api/v1/assets/public-assets-routes.test.ts"
Task: "T042 service tests in apps/web/src/server/services/public-content-assets.test.ts"
Task: "T043 E2E asset workflow in apps/web/e2e/public-wiki-api-assets.spec.ts"
```

After T047 is complete, T048 and T049 can be implemented in parallel because metadata and content routes are separate files.

### User Story 4

```bash
Task: "T053 search route tests in apps/web/app/api/v1/search/public-page-search-routes.test.ts"
Task: "T054 audit tests in apps/web/src/server/services/public-content-audit.test.ts"
Task: "T055 E2E search/audit/docs workflow in apps/web/e2e/public-wiki-api-search-audit.spec.ts"
```

Search implementation T058 can proceed in parallel with audit adapter hardening T059 after public schemas T056 are complete.

---

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 only.
3. Validate Reader/Editor/Admin read access, source visibility, hidden drafts, and OpenAPI read docs.
4. Stop for review before write APIs if a smaller MVP is needed.

### Core Wiki.js Replacement

1. Complete US1 and US2.
2. Validate external create, draft, publish, update, and history flows.
3. Confirm Reader cannot write even with mismatched scopes and that Editor/Admin writes are audited.

### Full Baseline Public API

1. Complete US1 through US4.
2. Validate asset upload/reference, permission-safe search, generated docs, audit records, and first-party client migration.
3. Run the full smoke and equivalence E2E suite before implementation sign-off.

## Notes

- Public `/api/v1` route handlers must stay thin adapters over shared services.
- MCP Server tools must map 1:1 to v1 REST endpoints and contain no business logic.
- Do not implement AI knowledge layering, AI governance, or AI-specific API scopes in these tasks.
- API changes must update generated docs through next-openapi-gen.
- Existing user work in unrelated dirty files must not be reverted during implementation.

## Validation Log

- 2026-06-29: `pnpm --filter @next-wiki/shared typecheck` passed.
- 2026-06-29: `pnpm --filter @next-wiki/web typecheck` passed.
- 2026-06-29: `pnpm --filter @next-wiki/web lint` passed.
- 2026-06-29: OpenAPI regenerated with `next-openapi-gen`; `/v1/pages`, `/v1/assets`, and `/v1/search/pages` are present in `apps/web/public/openapi.json`.
- 2026-06-29: `docker compose up -d --build` passed and `docker compose ps` showed healthy database plus running web service.
- 2026-06-29: Vitest and Playwright E2E remain unverified because direct test database access on `localhost:15433` requires sandbox escalation, and escalation was rejected by the platform usage limit.
- 2026-06-30: `docker compose up -d --build` passed after switching Docker production build to `next build --webpack`; `docker compose ps` showed healthy database plus running web service.
