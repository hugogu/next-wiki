# Tasks: Wiki MVP Foundation

**Input**: Design documents from `/specs/001-wiki-mvp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Include automated tests because the implementation plan explicitly
calls for Vitest, Playwright, migration smoke tests, route contract tests,
permission matrix tests, and rendering snapshot tests.

**Organization**: Tasks are grouped by user story so each increment can be
implemented and validated independently once the shared foundation is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`[US1]`, `[US2]`, `[US3]`, `[US4]`)
- Every task includes exact file paths so it is directly actionable

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the monorepo, toolchain, and Docker-first baseline that all
implementation work will use.

- [x] T001 Create the workspace manifests and shared TypeScript base config in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- [x] T002 Scaffold the web app and shared package manifests in `apps/web/package.json`, `apps/web/tsconfig.json`, `packages/shared/package.json`, and `packages/editor/package.json`
- [x] T003 [P] Configure repo-wide lint, format, and test entrypoints in `eslint.config.js`, `prettier.config.cjs`, `vitest.workspace.ts`, and `turbo.json`
- [x] T004 [P] Create the Docker-first local stack and sample environment in `docker-compose.yml`, `docker/web.Dockerfile`, and `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Deliver the cross-cutting infrastructure that blocks every user
story, including schema, auth, permissions, APIs, jobs, and the render
pipeline shell.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [x] T005 Implement environment loading and runtime secret validation in `apps/web/src/server/config/env.ts` and `apps/web/src/server/config/runtime.ts`
- [x] T006 Create the full MVP Drizzle schema and initial migration in `apps/web/src/server/db/schema/auth.ts`, `apps/web/src/server/db/schema/wiki.ts`, `apps/web/src/server/db/schema/ai.ts`, and `apps/web/src/server/db/migrations/0001_mvp_init.sql`
- [x] T007 [P] Wire the PostgreSQL client, schema exports, and migration runner in `apps/web/src/server/db/client.ts`, `apps/web/src/server/db/index.ts`, and `apps/web/src/server/db/migrate.ts`
- [x] T008 [P] Establish Better Auth core, session adapters, and local credential auth in `apps/web/src/server/auth/index.ts`, `apps/web/src/server/auth/providers.ts`, and `apps/web/src/server/auth/session.ts`
- [x] T009 [P] Implement the permission context model and precedence engine in `apps/web/src/server/services/permissions/context.ts` and `apps/web/src/server/services/permissions/engine.ts`
- [x] T010 [P] Create shared Zod contracts and service error primitives in `packages/shared/src/contracts/common.ts`, `packages/shared/src/contracts/wiki.ts`, and `packages/shared/src/errors.ts`
- [x] T011 [P] Scaffold the internal tRPC, public REST, MCP, and OpenAPI entrypoints in `apps/web/src/server/trpc/root.ts`, `apps/web/app/api/trpc/[trpc]/route.ts`, `apps/web/app/api/v1/[...route]/route.ts`, `apps/web/app/api/mcp/route.ts`, and `apps/web/app/api/v1/openapi/route.ts`
- [x] T012 [P] Set up pg-boss, task persistence, and the worker bootstrap in `apps/web/src/server/jobs/boss.ts`, `apps/web/src/server/jobs/task-service.ts`, and `apps/web/src/server/jobs/worker.ts`
- [x] T013 [P] Build the render pipeline skeleton and non-optional sanitization stage in `apps/web/src/server/pipeline/index.ts`, `apps/web/src/server/pipeline/cache.ts`, and `apps/web/src/server/pipeline/plugins/sanitize.ts`
- [x] T014 Implement the setup gate, site bootstrap state, and root app shell in `apps/web/app/layout.tsx`, `apps/web/app/(auth)/setup/page.tsx`, and `apps/web/src/server/services/setup/setup-service.ts`

**Checkpoint**: Database, auth, permissions, API shells, background jobs, and
rendering infrastructure are in place. User story work can now proceed.

---

## Phase 3: User Story 1 - Publish, Link, Search, and Translate Knowledge (Priority: P1) 🎯 MVP

**Goal**: Let editors create, revise, tag, move, search, render, and translate
Markdown-first wiki content with redirects and recoverable history.

**Independent Test**: Create a space, author multiple linked pages with tags
and translations, move one page, search by keyword and tag, and restore an
earlier revision without data loss.

### Tests for User Story 1

- [x] T015 [P] [US1] Add REST contract coverage for page, revision, and search flows in `apps/web/tests/contracts/pages.contract.test.ts`
- [x] T016 [P] [US1] Add an end-to-end authoring, move, search, and restore journey in `apps/web/tests/e2e/wiki-content.spec.ts`

### Implementation for User Story 1

- [x] T017 [P] [US1] Implement space, page, translation-group, revision, and source-level diff services in `apps/web/src/server/services/wiki/space-service.ts`, `apps/web/src/server/services/wiki/page-service.ts`, and `apps/web/src/server/services/wiki/revision-diff-service.ts`
- [x] T018 [P] [US1] Implement tag, outbound-link, and redirect services in `apps/web/src/server/services/wiki/tag-service.ts`, `apps/web/src/server/services/wiki/link-service.ts`, and `apps/web/src/server/services/wiki/redirect-service.ts`
- [x] T019 [P] [US1] Implement locale-aware search indexing and query services in `apps/web/src/server/services/search/index-service.ts` and `apps/web/src/server/services/search/query-service.ts`
- [x] T020 [P] [US1] Implement Markdown, Mermaid, LaTeX, draw.io, and internal-link render plugins in `apps/web/src/server/pipeline/plugins/markdown.ts`, `apps/web/src/server/pipeline/plugins/mermaid.ts`, `apps/web/src/server/pipeline/plugins/math.ts`, `apps/web/src/server/pipeline/plugins/drawio.ts`, and `apps/web/src/server/pipeline/plugins/internal-links.ts`
- [x] T021 [US1] Implement page and search tRPC routers in `apps/web/src/server/trpc/routers/pages.ts` and `apps/web/src/server/trpc/routers/search.ts`
- [x] T022 [US1] Implement page, revision-restore, and search REST routes in `apps/web/src/server/rest/routes/pages.ts` and `apps/web/src/server/rest/routes/search.ts`
- [x] T023 [US1] Build public page reading routes with locale fallback and redirect handling in `apps/web/app/(public)/[spaceKey]/[[...pagePath]]/page.tsx` and `apps/web/src/components/common/page-view.tsx`
- [x] T024 [US1] Build the editor route, Markdown editing UI, revision history panel, and revision diff view in `apps/web/app/(editor)/spaces/[spaceKey]/pages/[[...pagePath]]/page.tsx`, `apps/web/src/components/editor/page-editor.tsx`, `apps/web/src/components/editor/revision-history.tsx`, and `apps/web/src/components/editor/revision-diff-view.tsx`
- [x] T025 [US1] Build keyword search, tag filtering, and backlink discovery surfaces in `apps/web/app/(public)/search/page.tsx`, `apps/web/src/components/common/search-panel.tsx`, and `apps/web/src/components/common/tag-filter.tsx`
- [x] T026 [US1] Implement asset upload and draw.io artifact reference flows in `apps/web/src/server/services/assets/asset-service.ts` and `apps/web/src/server/rest/routes/assets.ts`
- [x] T027 [US1] Integrate page-save hooks for revisions, redirects, outbound links, and indexing jobs in `apps/web/src/server/services/wiki/save-page.ts`
- [x] T028 [US1] Build the locale switcher and missing-translation notice in `apps/web/src/components/common/locale-switcher.tsx` and `apps/web/src/components/common/missing-translation-banner.tsx`

**Checkpoint**: Editors can author, render, search, move, translate, and
restore wiki content independently of later stories.

---

## Phase 4: User Story 2 - Launch, Authenticate, and Administer the Wiki (Priority: P1)

**Goal**: Let an operator bring up the product with Docker, complete setup,
authenticate locally or externally, and manage core administration surfaces.

**Independent Test**: Start from an empty environment, complete first-run
setup, sign in locally, configure one external provider, and confirm the admin
surfaces for users, groups, permissions, tags, assets, and task visibility are
usable after restart.

### Tests for User Story 2

- [ ] T029 [P] [US2] Add integration coverage for first-run setup, local login, and external identity linking in `apps/web/tests/integration/auth-setup.test.ts`
- [ ] T030 [P] [US2] Add an admin bootstrap and permissions smoke journey in `apps/web/tests/e2e/admin-bootstrap.spec.ts`

### Implementation for User Story 2

- [ ] T031 [P] [US2] Implement the initialization service and setup REST route with idempotent re-entry guards in `apps/web/src/server/services/setup/init-service.ts` and `apps/web/src/server/rest/routes/setup.ts`
- [ ] T032 [P] [US2] Implement login, logout, password, and session UI flows in `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/logout/route.ts`, and `apps/web/src/components/common/login-form.tsx`
- [ ] T033 [P] [US2] Implement external auth provider management for OIDC, LDAP, and SAML in `apps/web/src/server/services/auth/provider-service.ts`
- [ ] T034 [P] [US2] Implement user, group, membership, and API-token admin services in `apps/web/src/server/services/admin/users-service.ts`, `apps/web/src/server/services/admin/groups-service.ts`, and `apps/web/src/server/services/admin/api-token-service.ts`
- [ ] T035 [US2] Implement admin REST routes for users, groups, permissions, auth providers, and API tokens in `apps/web/src/server/rest/routes/admin-users.ts`, `apps/web/src/server/rest/routes/admin-groups.ts`, `apps/web/src/server/rest/routes/admin-permissions.ts`, `apps/web/src/server/rest/routes/auth-providers.ts`, and `apps/web/src/server/rest/routes/api-tokens.ts`
- [ ] T036 [US2] Build the admin consoles for dashboard, users, groups, permissions, and auth providers in `apps/web/app/(admin)/admin/page.tsx`, `apps/web/app/(admin)/admin/users/page.tsx`, `apps/web/app/(admin)/admin/groups/page.tsx`, `apps/web/app/(admin)/admin/permissions/page.tsx`, and `apps/web/app/(admin)/admin/auth-providers/page.tsx`
- [ ] T037 [US2] Add permission-aware middleware and protected layouts across app surfaces in `apps/web/src/server/auth/authorize.ts`, `apps/web/app/(admin)/layout.tsx`, and `apps/web/app/(editor)/layout.tsx`
- [ ] T038 [US2] Build first-run admin list surfaces for background tasks, assets, and tags in `apps/web/app/(admin)/admin/tasks/page.tsx`, `apps/web/app/(admin)/admin/assets/page.tsx`, and `apps/web/app/(admin)/admin/tags/page.tsx`
- [ ] T039 [US2] Document operator startup, backup/restore, and restart-safe persistence and implement health/readiness endpoints in `docker/README.md`, `docker/backup-restore.md`, `apps/web/app/healthz/route.ts`, and `apps/web/app/readyz/route.ts`

**Checkpoint**: Operators can initialize, authenticate, administer, and restart
the wiki without losing configuration or content.

---

## Phase 5: User Story 3 - Customize the Site Visual Identity (Priority: P2)

**Goal**: Let administrators define and activate a token-driven site-wide theme
that consistently styles reading, editing, and admin surfaces.

**Independent Test**: Activate or edit a theme, refresh public, editor, and
admin views, and confirm the token changes apply consistently without harming
readability.

### Tests for User Story 3

- [ ] T040 [P] [US3] Add theme token application coverage in `apps/web/tests/integration/themes.test.ts`

### Implementation for User Story 3

- [ ] T041 [P] [US3] Implement theme validation and a zero-runtime-dependency token registry in `apps/web/src/server/services/themes/theme-service.ts`, `apps/web/src/server/services/themes/accessibility.ts`, and `packages/shared/src/theme/tokens.ts`
- [ ] T042 [P] [US3] Implement theme tRPC and REST routes plus activation workflow in `apps/web/src/server/trpc/routers/themes.ts` and `apps/web/src/server/rest/routes/admin-themes.ts`
- [ ] T043 [US3] Build the theme admin editor and activation UI in `apps/web/app/(admin)/admin/themes/page.tsx` and `apps/web/src/components/admin/theme-editor.tsx`
- [ ] T044 [US3] Apply CSS custom properties across public, editor, and admin shells in `apps/web/app/globals.css`, `apps/web/src/components/ui/theme-provider.tsx`, and `apps/web/src/components/common/app-shell.tsx`
- [ ] T045 [US3] Create the default documentation-led theme as plain shared token objects and build the preview surface in `packages/shared/src/theme/default-theme.ts` and `apps/web/src/components/admin/theme-preview.tsx`

**Checkpoint**: The product has a consistent token-based visual system with one
active site-wide theme.

---

## Phase 6: User Story 4 - Ask Questions Against Wiki Knowledge with AI (Priority: P2)

**Goal**: Let administrators configure AI providers and let users ask grounded,
permission-scoped questions through a persistent chat side pane.

**Independent Test**: Configure one provider, index wiki content, ask a
question from a page, receive a cited answer, and confirm restricted content is
not exposed.

### Tests for User Story 4

- [ ] T046 [P] [US4] Add contract and job-flow coverage for AI provider and chat endpoints in `apps/web/tests/contracts/ai.contract.test.ts` and `apps/web/tests/e2e/ai-chat.spec.ts`

### Implementation for User Story 4

- [ ] T047 [P] [US4] Implement AI provider configuration, credential encryption, and provider health checks in `apps/web/src/server/services/ai/provider-service.ts`
- [ ] T048 [P] [US4] Implement AI knowledge ingestion jobs and citation assembly in `apps/web/src/server/jobs/handlers/index-page.ts` and `apps/web/src/server/services/ai/knowledge-service.ts`
- [ ] T049 [P] [US4] Implement persistent conversation, message, citation, and session-bridge services in `apps/web/src/server/services/ai/conversation-service.ts` and `apps/web/src/server/services/ai/message-service.ts`
- [ ] T050 [P] [US4] Implement AI REST, tRPC, MCP, and SSE streaming handlers in `apps/web/src/server/rest/routes/ai.ts`, `apps/web/src/server/trpc/routers/ai.ts`, `apps/web/src/server/mcp/tools/wiki-tools.ts`, and `apps/web/app/api/ai/stream/route.ts`
- [ ] T051 [US4] Build the AI provider admin UI, AI conversation admin visibility surface, and task monitoring panel in `apps/web/app/(admin)/admin/ai/page.tsx`, `apps/web/app/(admin)/admin/ai/conversations/page.tsx`, and `apps/web/src/components/admin/ai-provider-form.tsx`
- [ ] T052 [US4] Build the persistent AI chat side pane, citation list, and SSE client hook in `apps/web/src/components/chat/ai-chat-pane.tsx`, `apps/web/src/components/chat/ai-citation-list.tsx`, and `apps/web/src/hooks/use-chat-stream.ts`
- [ ] T053 [US4] Wire page-scoped chat launch and AI draft handoff into page surfaces through dedicated chat components in `apps/web/src/components/common/page-toolbar.tsx`, `apps/web/src/components/chat/chat-launcher.tsx`, and `apps/web/src/components/editor/ai-draft-sheet.tsx`
- [ ] T054 [US4] Enforce permission-scoped retrieval and provider-disabled fallback behavior in `apps/web/src/server/services/ai/answer-service.ts`

**Checkpoint**: AI remains optional but, when configured, provides grounded and
permission-safe chat with citations and normal draft flows.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finish the shared quality, hardening, and validation work that
cuts across stories.

- [ ] T055 [P] Add migration smoke, permission-matrix, and render snapshot suites in `apps/web/tests/smoke/migrations.test.ts`, `apps/web/tests/integration/permissions.test.ts`, and `apps/web/tests/snapshots/render-pipeline.test.ts`
- [ ] T056 [P] Add optional quality-hardening audit logging, error handling, and secret redaction in `apps/web/src/server/services/audit/log-service.ts` and `apps/web/src/server/rest/error-handler.ts`
- [ ] T057 Run the documented quickstart validation and capture operator notes in `specs/001-wiki-mvp/quickstart.md` and `docker/README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies and can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all story work.
- **Phase 3 (US1)**: Depends on Phase 2 and can begin as soon as the shared wiki foundation exists.
- **Phase 4 (US2)**: Depends on Phase 2 and can run in parallel with US1, although both P1 stories should be complete for the first production-capable MVP.
- **Phase 5 (US3)**: Depends on Phase 2 and benefits from US2 admin surfaces, but remains independently testable.
- **Phase 6 (US4)**: Depends on Phase 2 and benefits from US1 content plus US2 admin/auth flows, but remains independently testable.
- **Phase 7 (Polish)**: Depends on completion of the stories selected for the release cut.

### User Story Dependencies

- **US1**: Needs the shared schema, auth context, permission engine, APIs, jobs, and render pipeline from Phase 2.
- **US2**: Needs the shared schema, auth base, permission engine, and app shell from Phase 2.
- **US3**: Needs the shared schema plus the admin shell from US2 for the best delivery path.
- **US4**: Needs content, revisions, jobs, permissions, and admin/auth surfaces from earlier phases.

### Within Each User Story

- Story-level tests should be written before or alongside implementation and must fail before the corresponding behavior is complete.
- Service-layer work precedes transport-layer work.
- Transport-layer work precedes page-level UI integration.
- Background jobs and permission checks must be wired before story acceptance validation.

### Suggested Delivery Order

1. Complete Phase 1 and Phase 2.
2. Deliver **US1 + US2** as the first real MVP release slice.
3. Add **US3** once the core admin shell is stable.
4. Add **US4** after content, permissions, and jobs are trustworthy.
5. Finish with Phase 7 hardening and full quickstart validation.

---

## Parallel Opportunities

- **Setup**: T003 and T004 can run in parallel after T001 and T002 define the workspace.
- **Foundational**: T007 through T013 can proceed in parallel once T006 establishes the schema shape.
- **US1**: T017 through T020 can proceed in parallel before the routers and UI tasks.
- **US2**: T031 through T034 can proceed in parallel before the admin routes and screens.
- **US3**: T041 and T042 can proceed in parallel before token application and theme UI work.
- **US4**: T047 through T050 can proceed in parallel before the final chat-pane integration.

## Parallel Example: User Story 1

```bash
Task: "Implement space, page, translation-group, and revision services in apps/web/src/server/services/wiki/space-service.ts and apps/web/src/server/services/wiki/page-service.ts"
Task: "Implement tag, outbound-link, and redirect services in apps/web/src/server/services/wiki/tag-service.ts, apps/web/src/server/services/wiki/link-service.ts, and apps/web/src/server/services/wiki/redirect-service.ts"
Task: "Implement locale-aware search indexing and query services in apps/web/src/server/services/search/index-service.ts and apps/web/src/server/services/search/query-service.ts"
Task: "Implement Markdown, Mermaid, LaTeX, draw.io, and internal-link render plugins in apps/web/src/server/pipeline/plugins/markdown.ts, apps/web/src/server/pipeline/plugins/mermaid.ts, apps/web/src/server/pipeline/plugins/math.ts, apps/web/src/server/pipeline/plugins/drawio.ts, and apps/web/src/server/pipeline/plugins/internal-links.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Implement the initialization service and setup REST route in apps/web/src/server/services/setup/init-service.ts and apps/web/src/server/rest/routes/setup.ts"
Task: "Implement login, logout, password, and session UI flows in apps/web/app/(auth)/login/page.tsx, apps/web/app/(auth)/logout/route.ts, and apps/web/src/components/common/login-form.tsx"
Task: "Implement external auth provider management for OIDC, LDAP, and SAML in apps/web/src/server/services/auth/provider-service.ts"
Task: "Implement user, group, membership, and API-token admin services in apps/web/src/server/services/admin/users-service.ts, apps/web/src/server/services/admin/groups-service.ts, and apps/web/src/server/services/admin/api-token-service.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Implement theme validation and token-registry services in apps/web/src/server/services/themes/theme-service.ts, apps/web/src/server/services/themes/accessibility.ts, and packages/shared/src/theme/tokens.ts"
Task: "Implement theme tRPC and REST routes plus activation workflow in apps/web/src/server/trpc/routers/themes.ts and apps/web/src/server/rest/routes/admin-themes.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Implement AI provider configuration, credential encryption, and provider health checks in apps/web/src/server/services/ai/provider-service.ts"
Task: "Implement AI knowledge ingestion jobs and citation assembly in apps/web/src/server/jobs/handlers/index-page.ts and apps/web/src/server/services/ai/knowledge-service.ts"
Task: "Implement conversation, message, and citation services in apps/web/src/server/services/ai/conversation-service.ts and apps/web/src/server/services/ai/message-service.ts"
Task: "Implement AI REST, tRPC, and MCP handlers in apps/web/src/server/rest/routes/ai.ts, apps/web/src/server/trpc/routers/ai.ts, and apps/web/src/server/mcp/tools/wiki-tools.ts"
```

---

## Implementation Strategy

### MVP First

1. Finish Setup and Foundational phases.
2. Deliver User Story 1 and User Story 2 together as the smallest
   production-capable release slice.
3. Validate the quickstart flow from clean startup through content authoring.
4. Hold release only after restart persistence and permission behavior pass.

### Incremental Delivery

1. **Foundation**: Phase 1 and Phase 2 establish the app, schema, auth, APIs,
   jobs, and render pipeline.
2. **Core Wiki MVP**: US1 + US2 deliver deployable content and operator value.
3. **Branding Layer**: US3 adds the token-based theme system without changing
   core content behavior.
4. **AI Layer**: US4 adds optional grounded chat without becoming a prerequisite
   for the rest of the wiki.
5. **Hardening**: Phase 7 finalizes validation, logging, and regression safety.

### Parallel Team Strategy

1. One developer handles workspace and Docker setup while another prepares the
   schema draft.
2. After Phase 2, split by domain:
   - Developer A: content and rendering work in US1
   - Developer B: auth and admin work in US2
   - Developer C: themes in US3 once admin scaffolding lands
   - Developer D: AI and MCP work in US4 once jobs and content services land
3. Rejoin for Phase 7 hardening and quickstart validation.

---

## Notes

- `[P]` tasks touch separate files and are intentionally chosen to minimize merge conflicts.
- All transport layers must reuse shared service behavior and shared validation contracts.
- Redirect, search, AI retrieval, and page reads must all use the same permission engine.
- The first release cut should stop after US1 + US2 if schedule pressure appears.
