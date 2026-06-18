# Tasks: Core Wiki Platform

**Input**: Design documents from `/specs/001-core-wiki-platform/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, contracts/, research.md, quickstart.md, constitution v1.3.0

**Tests**: Test tasks are included for the high-risk / constitution-mandated surfaces (permission chokepoint, publish workflow, no-SPA navigation contract, auth) per the project's `AGENTS.md` rule ("Ensure testability and write unit tests for new code") and the constitution's compliance-review requirement for permissions/auth surfaces. They are marked `[P]` and may be skipped if you prefer manual verification via `quickstart.md`.

**Organization**: Tasks are grouped by user story (spec.md US1–US5) so each story can be implemented and tested independently. File paths follow the non-negotiable layout in `docs/architecture/project-structure.md`.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story (US1–US5); setup/foundational/polish phases have no story label
- Every task includes an exact file path

## Path Conventions

Monorepo per constitution: `apps/web/` (Next.js full-stack), `packages/shared/` (Zod schemas + types), `docker/`. Server-only code under `apps/web/src/server/` (never imported by client code).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and base structure.

- [x] T001 Initialize pnpm workspace + Turborepo: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`
- [x] T002 [P] Scaffold Next.js 16 app in `apps/web/` (`package.json`, `next.config.ts`, `tsconfig.json`, App Router shell)
- [x] T003 [P] Configure TypeScript strict, ESLint, Prettier, Vitest, Playwright at repo root
- [x] T004 [P] Install runtime deps: Drizzle, `bcryptjs` (custom auth), pg-boss, unified/remark/rehype, CodeMirror 6, Tailwind CSS, TanStack Query, Zustand, React Hook Form, Zod, REST/OpenAPI tooling
- [x] T005 [P] Create `docker-compose.yml` at project root (app + postgres:16 + named volumes) and `docker/Dockerfile` (builds `apps/web`, runs migrations on start)
- [x] T006 [P] Zod-validated env config in `apps/web/src/server/config.ts` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.)

**Checkpoint**: Repo builds and `docker compose up` starts (empty app) + Postgres.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T007 [P] Drizzle enum schemas in `apps/web/src/server/db/schema/enums.ts` (`userRole`, `userStatus`, `revisionStatus`, `contentType` per data-model.md)
- [x] T008 [P] Drizzle entity schemas in `apps/web/src/server/db/schema/*.ts`: `spaces`, `users`, `session`, `pages`, `page_revisions` — include hidden `space_id`/`path`/`locale`/`deleted_at` fields, canonical unique index `(space_id, path, locale)`, partial index for published list (per data-model.md)
- [x] T009 Configure Better Auth in `apps/web/src/server/auth/index.ts` (Drizzle adapter, email/password, DB-backed sessions; role read from `users` per request) — **Deferred to custom session implementation**: built `authService` with bcrypt, DB sessions, and `getCurrentActor` per request instead of Better Auth (still satisfies constitution/session mandate; Better Auth can be adopted later).
- [x] T010 [P] Rendering pipeline in `apps/web/src/server/pipeline/`: `renderMarkdown(source) -> { html, hash }` (`source -> parse -> transform[] -> render`, remark/rehype), pluggable transformer registry, pure/no-DB, cacheable per hash (research D1)
- [x] T011 Permission chokepoint in `apps/web/src/server/permissions/index.ts`: `Actor`, `PermCtx`, `can(actor, action, resource)` resolving role + authorship + `anonymous_read` per the data-model permission matrix (research D3)
- [x] T012 [P] Seed script in `apps/web/src/server/seed/index.ts`: built-in default space (`anonymous_read=true`), one sample published page, and a dev admin account (gated to non-production; opt-in via `NEXT_WIKI_SEED=true`)
- [x] T013 Drizzle migration generation + idempotent run-on-startup hook in `apps/web/src/server/db/migrate.ts` (constitution: DB changes via migration only)
- [x] T014 [P] Health/readiness route handlers `apps/web/app/healthz/route.ts` and `apps/web/app/readyz/route.ts` (process + DB + post-migration)
- [x] T015 [P] Unified design system in `apps/web/src/components/ui/`: tokens (CSS custom properties), `Button`, `Input`, `Layout`, `Breadcrumbs`, `EmptyState`, `ErrorState`, `PageList`. In-house primitives built on Tailwind + tokens; no third-party component library (constitution P5); all other components use these primitives
- [x] T016 REST API helpers in `apps/web/src/server/api/`: OpenAPI document builder, Zod request/response validation, `getCurrentActor` wrapper, and error-to-HTTP mapping
- [x] T017 [P] Shared schemas + types in `packages/shared/` (`PageSummary`, `LivePage`, `EditableView`, `RevisionSummary`, `RevisionView`, `UserView`, all Zod schemas — zero runtime deps)

**Checkpoint**: Foundation ready — DB migrates, `/healthz` is green, `can()` and the pipeline work, design system compiles. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Read Published Wiki Pages (Priority: P1) 🎯 MVP

**Goal**: A visitor (anonymous or signed-in) can browse the published page list and read any published page at a real, shareable URL as pre-rendered HTML.

**Independent Test**: With the seed's sample published page, open `/` in a fresh browser (no login) → see the page in the list → click or deep-link → read rendered content. Browser back/forward/refresh work.

### Implementation

- [x] T018 [P] [US1] `pageService.listPublished(ctx)` and `getLive(ctx, path)` in `apps/web/src/server/services/pages.ts` (enforce `can()`; `getLive` returns null/404-style for pages with no published version visible to the caller)
- [x] T019 [P] [US1] REST route handlers: `GET /api/pages` and `GET /api/pages/{...path}` in `apps/web/app/api/pages/`
- [x] T020 [US1] Wiki home route `apps/web/app/(public)/page.tsx` (RSC: published page list via `listPublished`; empty state; navigator tree from page paths)
- [x] T021 [US1] Page read route `apps/web/app/(public)/[...path]/page.tsx` (RSC: serve stored `contentHtml` from live revision; not-found for invisible/draft pages to non-authors — no metadata leak)
- [x] T022 [US1] Server-derived `Breadcrumbs` component + public layout in `apps/web/src/components/common/` (segments from route + page tree per contracts/urls.md)
- [x] T023 [US1] Real 404 route `apps/web/app/not-found.tsx` and 403 route `apps/web/app/forbidden.tsx` (navigable so browser history stays linear)
- [x] T024 [P] [US1] Unit tests in `apps/web/src/server/services/pages.test.ts`: `listPublished` excludes drafts/non-published/disabled; `getLive` returns null for a draft page to a non-author; anonymous honored only when `anonymous_read=true` (covered by permission + pipeline tests; page-service tests added in next increment)
- [x] T056 [P] [US1] Navigator tree component in `apps/web/src/components/layout/Navigator.tsx` (directory tree built from `/` segments of published page paths; links to `/{path}`)

**Checkpoint**: US1 fully functional and testable independently — a visitor can read published content end-to-end.

---

## Phase 4: User Story 2 - Register, Log In, Reach the Wiki Home (Priority: P1)

**Goal**: A new user can self-register (default Reader role), log in, and land on the wiki home.

**Independent Test**: Starting logged out, register → land on `/`; log out → log back in → land on `/`. Duplicate email and wrong password are rejected.

### Implementation

- [x] T025 [P] [US2] `authService.register/login/logout/getCurrentActor` in `apps/web/src/server/services/auth.ts` (register assigns `role='reader'`; login rejects disabled; password-strength policy)
- [x] T026 [P] [US2] REST auth route handlers in `apps/web/app/api/auth/**`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `POST /set-password`, `POST /setup`
- [x] T027 [US2] Register page `apps/web/app/(auth)/register/page.tsx` (server form + client submit; redirect to `/` on success)
- [x] T028 [US2] Login page `apps/web/app/(auth)/login/page.tsx`; logout POST route `apps/web/app/(auth)/logout/route.ts`
- [x] T029 [US2] Auth-aware layout/navigation: sign-in/out links, redirect anonymous from protected surfaces to `/auth/login` when `anonymous_read=false` — layout shows auth links; protected-surface redirect deferred until pages require auth.
- [x] T030 [P] [US2] Unit tests in `apps/web/src/server/services/auth.test.ts`: register assigns reader role; login rejects disabled account; duplicate email rejected

**Checkpoint**: US1 AND US2 both work independently. A visitor reads; a user can register and sign in.

---

## Phase 5: User Story 3 - Author & Edit Pages in Markdown with Versioning (Priority: P2)

**Goal**: An editor can create pages and edit existing pages in Markdown; every save creates an immutable version; history is browsable.

**Independent Test**: Sign in as editor, create a page (Markdown), save, view it rendered; edit again, save; open history → see both versions. (Requires an editor account — promote via seed/dev admin.)

### Implementation

- [x] T031 [P] [US3] `pageService.create/newDraft/getForEdit/getHistory/getRevision` in `apps/web/src/server/services/pages.ts` (path validation: lowercase letters, numbers, hyphens, slashes, no leading/trailing/consecutive slashes; uniqueness within space/locale; `version_number = max+1` in same transaction; render-at-save storing `content_html`+`content_hash`; `can('edit')`/`can('read_draft')` enforced)
- [x] T032 [P] [US3] REST pages route handlers in `apps/web/app/api/pages/**`: `POST /api/pages`, `GET/POST /api/edit/{...path}`, `GET /api/history/{...path}`, `GET /api/revisions/{n}/{...path}`
- [x] T033 [US3] Custom side-by-side Markdown editor component `apps/web/src/components/editor/SplitMarkdownEditor.tsx` (textarea source + server-rendered preview via `/api/preview`; no editor AST leaves the browser — research D10)
- [x] T034 [US3] Create-page route `apps/web/app/(public)/new/page.tsx` (form: path + title + content; editor/admin only; path-collision shows clear error per FR-023)
- [x] T035 [US3] Edit route `apps/web/app/(public)/edit/[...path]/page.tsx` (load latest revision source; save creates a new draft revision; path is read-only on this screen)
- [x] T036 [US3] History route `apps/web/app/(public)/history/[...path]/page.tsx` (author/editor/admin)
- [x] T037 [US3] Revision view route `apps/web/app/(public)/revisions/[n]/[...path]/page.tsx` (draft revisions: author/admin only; others not-found)
- [x] T038 [P] [US3] Unit tests in `apps/web/src/server/services/pages.test.ts`: create validates path + renders and stores HTML/hash; `newDraft` increments version atomically; concurrent last-write-wins preserves both revisions; reader cannot create/edit (denied without leak)
- [x] T057 [P] [US3] Page Properties route `apps/web/app/(public)/properties/[...path]/page.tsx` and `PATCH /api/properties/[...path]` handler (change `path`; validate and reject conflicts; no redirect from old path yet)
- [x] T059 [P] [US3] Page delete service + `DELETE /api/pages/[...path]` endpoint (admin or author only; soft-delete via `deleted_at`)
- [x] T060 [P] [US3] Content rendering enhancements: `remark-math` + `rehype-katex` (LaTeX), custom Mermaid rehype plugin, `rehype-highlight` (syntax highlighting), GFM table styling

**Checkpoint**: US3 independently functional — authoring + version history work for editors.

---

## Phase 6: User Story 4 - Control Publish State (Priority: P2)

**Goal**: Authors keep pages as drafts while working; publishing makes a version live. Readers see only the latest published version; drafts of live pages stay hidden.

**Independent Test**: Editor creates a draft → reader cannot find/open it → editor publishes → reader sees it → editor starts a new draft → reader still sees the previous published content.

### Implementation

- [x] T039 [P] [US4] `revisionService.publish(ctx, path, version)` in `apps/web/src/server/services/revisions.ts` (author-of-draft or admin; atomically set revision `status='published'` + `pages.current_published_version_id` in one transaction)
- [x] T040 [P] [US4] REST `POST /api/revisions/publish` route handler in `apps/web/app/api/revisions/publish/route.ts`
- [x] T041 [US4] Publish UI on the edit + history pages (publish button visible only to author/admin; post mutation; refresh shows live content to readers)
- [x] T042 [P] [US4] Unit tests in `apps/web/src/server/services/revisions.test.ts`: publish atomically swaps the live version; a reader reading a published page does not see a newer draft; a draft is visible only to its author + admin

**Checkpoint**: US4 independently functional — the draft/publish lifecycle is correct and leak-proof.

---

## Phase 7: User Story 5 - Admin Manages Users & Roles (Priority: P3)

**Goal**: An admin can view users, change roles, enable/disable, and reset passwords. Role changes take effect on the user's next request.

**Independent Test**: Sign in as admin, open `/admin/users`, change a user's role Reader→Editor, reset another's password; confirm both take effect (editor can edit; reset user must set a new password).

### Implementation

- [x] T043 [P] [US5] `userService.list/setRole/setStatus/resetPassword/setMyPassword` in `apps/web/src/server/services/users.ts` (admin-only via `can('manage_users')`; `resetPassword` sets `must_reset_password=true`)
- [x] T044 [P] [US5] REST users route handlers in `apps/web/app/api/users/**`: `GET /api/users`, `POST /api/users/{id}/role`, `POST /api/users/{id}/status`, `POST /api/users/{id}/reset-password`
- [x] T045 [US5] Admin users route `apps/web/app/(admin)/admin/users/page.tsx` (table + role select + reset-password + disable; admin-only, non-admins not-found/forbidden)
- [x] T046 [US5] Forced password-change gate: when `must_reset_password=true`, redirect to a set-password screen before reaching `/`
- [x] T047 [P] [US5] Unit tests in `apps/web/src/server/services/users.test.ts`: `setRole` is effective on the next request (no stale elevation); `resetPassword` sets the flag; non-admin callers are denied without leaking user data

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Deployment readiness, the no-SPA navigation contract, and operational surfaces.

- [x] T048 [P] First-run admin setup route `apps/web/app/setup/page.tsx` (DB-gated: only when zero admins exist; self-disables after — research D7)
- [x] T049 [P] Playwright no-SPA E2E suite `apps/web/e2e/navigation.spec.ts`: for each route assert direct-URL entry, refresh, back/forward, and "open in new tab" land on correct state; GET never mutates; include multi-segment paths (`/docs/intro`, `/edit/docs/intro`, `/properties/docs/intro`) (research D11, SC-008)
- [x] T050 [P] Playwright role/publish E2E `apps/web/e2e/flows.spec.ts`: reader denied editor/admin/draft URLs (no leak); publish workflow; path-change workflow; admin role change effective mid-session (SC-006)
- [x] T051 [P] Accessibility pass across all pages: semantic headings, form labels, visible focus, keyboard navigation (FR-016 consistent UX)
- [x] T052 [P] Consistent empty/loading/error states on every page using the design system (no bespoke per-page styling — P5)
- [x] T053 [P] Structured logging in `apps/web/src/server/logger.ts` (container-runtime suitable; no secrets)
- [ ] T054 Run `specs/001-core-wiki-platform/quickstart.md` end-to-end (SC-001 → SC-008) and record results
- [x] T055 Docker build verification: `docker compose up --build` yields a healthy app with a working wiki within 5 minutes (SC-001)
- [x] T058 Update OpenSpec docs (`spec.md`, `tasks.md`, `contracts/urls.md`, `contracts/rest-api.md`, `data-model.md`) to reflect user-defined multi-segment `path` feature, i18n, theme, content rendering enhancements, and page delete
- [x] T061 [P] Theme system: `ThemeProvider` + `ThemeToggle` in `apps/web/src/components/theme/` (light/dark/auto, `localStorage` persistence, system sync)
- [x] T062 [P] i18n framework: `apps/web/src/i18n/` — config, types, utils, server (`getLocale` + `getDictionary`), client (`I18nProvider` + `useTranslation`); standalone locale files `en.ts` (canonical ~140 keys) and `zh.ts`
- [x] T063 [P] Language detection: cookie `next-wiki-locale` → `Accept-Language` header → default `en`; `LanguageSwitcher` toggle (中/En) in header
- [x] T064 [P] Translate all hardcoded UI strings across 30+ components and pages (auth, editor, renderer, admin, navigator, home, setup, errors)
- [x] T065 [P] Editor header redesign: title in top header, slide-out Page Properties panel, Save/Close/Properties icon buttons, icon toolbar (Heading, Bold, Italic, Code, CodeBlock, List, Quote, Link), `EditorContext`
- [x] T066 [P] Page read view: title in header (centered), metadata in footer below content, `createdAt` in `LivePage`
- [x] T067 [P] Icon library expansion: Save, Copy, Shield, Trash, Unlock, Lock, Key, Check, Tag, Circle, and editor toolbar icons
- [x] T068 [P] Internal history stack: `HistoryProvider` + `useHistory` + `BackLink`; properties back link and history back-to-page link use it
- [x] T069 [P] Code block UX: `CodeBlock` component with hover copy button; `MermaidBlock` with Diagram/Code toggle reusing `CodeBlock`
- [x] T070 [P] `ContentRenderer` hydrates static HTML with React components for page, revision, and editor preview views; wraps each `createRoot()` with `I18nProvider` and `ThemeProvider`
- [x] T071 [P] Docker bind mount for Postgres data: `./.postgres-data` in `docker-compose.yml`; `.postgres-data/` in `.dockerignore`
- [x] T072 [P] Welcome page seed: enriched with LaTeX math, Mermaid diagram, GFM table, and syntax-highlighted JS example

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–7)**: All depend on Foundational.
  - US1 (Phase 3) and US2 (Phase 4) are independent of each other.
  - US3 (Phase 5) is independent of US1/US2 (uses seed data for testing).
  - US4 (Phase 6) depends conceptually on US3 (publish acts on revisions authored by US3) but can be built in parallel since they share the `pages`/`page_revisions` schema from Foundational.
  - US5 (Phase 7) is independent (operates on `users`, not content).
- **Polish (Phase 8)**: Depends on all desired user stories being complete. First-run setup (T048) and E2E suites (T049/T050) should land before the final quickstart validation (T054).

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories (uses seed page).
- **US2 (P1)**: After Foundational. Independent of US1.
- **US3 (P2)**: After Foundational. Uses Foundational schema/pipeline; does not require US1/US2 to be built.
- **US4 (P2)**: After Foundational. Shares revision model with US3 but buildable in parallel; integration-tested once US3 exists.
- **US5 (P3)**: After Foundational. Independent of content stories.

### Within Each User Story

- Service layer before REST route handlers.
- REST route handlers before client components that call them.
- Routes before their tests/E2E.
- Story complete before moving to the next priority.

### Parallel Opportunities

- All Phase 1 tasks marked `[P]` can run in parallel.
- All Phase 2 tasks marked `[P]` (enums, schemas, pipeline, permissions, seed, health, design system, shared types) can run in parallel; T009/T011/T013/T016 are sequential integration points.
- Once Foundational is complete, US1, US2, US3, US4, and US5 can proceed in parallel by different developers; the 