# Tasks: Pluggable Content Storage & In-Editor Images

## Phase 8: Authoritative Database with Concurrent Replicas

- [ ] T101 Add replica lifecycle, preferred-read, and replication-task schema plus additive migration in `apps/web/src/server/db/schema/` and `apps/web/src/server/db/migrations/`
- [ ] T102 Update shared storage API schemas for replica states, enable/disable, read preference, and synchronization status in `packages/shared/src/content-storage.ts`
- [ ] T103 Make revision Markdown and image bytes commit to Database on every write and create replication tasks transactionally in `apps/web/src/server/services/pages.ts` and `apps/web/src/server/content-store/atomic-write.ts`
- [ ] T104 Implement replica delivery, backfill, retry, repair, and recovery jobs in `apps/web/src/server/jobs/`
- [ ] T105 Implement preferred-replica reads with hash validation and Database fallback in `apps/web/src/server/content-store/registry.ts`, `apps/web/src/server/services/pages.ts`, and `apps/web/src/server/services/content-assets.ts`
- [ ] T106 Replace backend switch APIs with enable, disable, and read-preference APIs in `apps/web/app/api/storage/`
- [ ] T107 Replace the storage summary/switch UI with extensible left-side backend tabs and per-tab toggles in `apps/web/app/(admin)/admin/storage/page.tsx` and `apps/web/src/components/admin/storage/`
- [ ] T108 Add permission-checked S3 presigned redirects with Database fallback in `apps/web/app/api/assets/[id]/route.ts`
- [ ] T109 Add schema, service, job, API, fallback, and UI tests in `apps/web/src/server/**/*.test.ts` and `apps/web/e2e/`
- [ ] T110 Regenerate `apps/web/public/openapi.json` with next-open-api and verify using `docker compose up -d --build`

**Input**: Design documents from `/specs/003-content-storage-backends/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The specification explicitly requires Vitest unit/integration tests,
ContentStore conformance tests, migration-state tests, and Playwright E2E
verification. Test tasks appear before implementation tasks in each story.

**Organization**: Tasks are grouped by user story so each story can be
implemented and validated as an independent increment.

## Implementation status & scope notes

**Delivered: Foundation + US1 (MVP) + US2 backend config + US3 migration + US4 scopes.**

- **MVP (Phase 1/2/3, US1)** — Database-backed in-editor images.
- **US2 core (Phase 4)** — Local + S3 ContentStore backends, storage-config
  service, admin API + `/admin/storage` UI, markdown indirection, MinIO profile.
- **US3 (Phase 5)** — pg-boss worker (T020/T021), safe copy→verify→cutover
  migration with write-lock/abort/recovery, retained-backend + orphan cleanup,
  and the migration/cleanup admin UI. Verified live: cutover, 423 write-lock,
  read availability, and crash recovery.
- **US4 (Phase 6)** — `storage`/`preferences` API-key scopes, the
  `manage_storage`/`manage_preferences` actions through `can()` (scope ∩ role),
  scoped preference self-service, admin-gated storage routes, and key-create UI.

The following tasks remain **deferred** to a later increment:

- **Git export (T041, T049–T052)** — Git one-way export (US2b). `isomorphic-git`
  is the only outstanding dependency from T001 (`pg-boss` and
  `@aws-sdk/client-s3` are now installed).
- **T025** — route-handler unit tests. This project tests at the service layer
  plus Playwright e2e (no existing route-level unit tests); route behavior is
  covered by service tests and the `e2e/*.spec.ts` files.
- **Phase 7 polish** — quickstart docs (T093) and the final security/i18n
  review passes (T099/T100) beyond what the suites already enforce.

The reusable ContentStore conformance suite (T006) lives in
`content-store.conformance.ts` (a plain module, not `*.test.ts`) so it can be
imported by each backend's test file without executing twice. S3 conformance
(T039) runs only when MinIO env (`S3_TEST_*`) is provided.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not
  depend on another incomplete task in the same phase.
- **[Story]**: Maps the task to its user story.
- Every task names the exact file or directory it changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependencies, configuration, and test infrastructure required by
the storage subsystem without changing user-visible behavior.

- [ ] T001 Add `pg-boss`, `@aws-sdk/client-s3`, and `isomorphic-git` dependencies in `apps/web/package.json` and `pnpm-lock.yaml`
- [X] T002 [P] Add asset-size, abandoned-upload TTL, and optional local-store defaults in `apps/web/src/server/config.ts`
- [X] T003 [P] Add a MinIO integration profile and optional Local content volume without changing the default PostgreSQL-only deployment in `docker-compose.yml`
- [X] T004 [P] Create reusable storage test fixtures and temporary-directory helpers in `apps/web/test/content-storage-fixtures.ts`
- [X] T005 Create shared backend, asset, migration, cleanup, and Git-export Zod schemas in `packages/shared/src/content-storage.ts` and export them from `packages/shared/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the schema, ContentStore contract, atomic write protocol,
job lifecycle, and read/write indirection required by every story.

**⚠️ CRITICAL**: No user story implementation starts until this phase is complete.

### Tests for the Foundation

- [X] T006 [P] Create the reusable ContentStore conformance suite for round trips, idempotency, missing keys, enumeration, atomic visibility, namespace confinement, and health checks in `apps/web/src/server/content-store/content-store.contract.test.ts`
- [X] T007 [P] Add integration tests for the storage schema, default active Database backend, nullable revision source, and single-active-migration constraint in `apps/web/src/server/db/content-storage-schema.test.ts`
- [X] T008 [P] Add unit tests for external-first writes, compensation, and orphan detection in `apps/web/src/server/content-store/atomic-write.test.ts`

### Foundation Implementation

- [X] T009 Add storage backend, backend purpose, content asset kind, and migration status enums in `apps/web/src/server/db/schema/enums.ts`
- [X] T010 Define `storage_backends`, `content_assets`, `content_asset_refs`, `content_blobs`, and `content_migrations`, make `page_revisions.content_source` nullable, and add required indexes/constraints in `apps/web/src/server/db/schema/index.ts`
- [X] T011 Generate and review the additive Drizzle migration and metadata snapshot in `apps/web/src/server/db/migrations/` and `apps/web/src/server/db/migrations/meta/`
- [X] T012 Seed exactly one active Database primary backend idempotently in `apps/web/src/server/seed/index.ts`
- [X] T013 [P] Define ContentStore types, typed backend errors, key helpers, and namespace rules in `apps/web/src/server/content-store/types.ts`
- [X] T014 Implement the Database ContentStore with transactional Markdown/image persistence in `apps/web/src/server/content-store/database-store.ts`
- [X] T015 Implement the explicit backend registry and injected store factories in `apps/web/src/server/content-store/registry.ts`
- [X] T016 Implement external-first write, compensation, and grace-period orphan helpers in `apps/web/src/server/content-store/atomic-write.ts`
- [X] T017 Refactor page create, draft, history, and live-read paths to use the active ContentStore while preserving rendered HTML and fingerprints in `apps/web/src/server/services/pages.ts`
- [X] T018 Refactor revision reads and publish paths to resolve raw Markdown through the active ContentStore in `apps/web/src/server/services/revisions.ts`
- [X] T019 Add `STORAGE_MIGRATING`, backend-unavailable, and storage-validation domain/API mappings including HTTP 423 in `apps/web/src/server/errors.ts` and `apps/web/src/server/api/errors.ts`
- [X] T020 [P] Implement the lifecycle-injected pg-boss factory in `apps/web/src/server/jobs/create-boss.ts`
- [X] T021 Implement explicit job registration and framework-managed startup without a global singleton in `apps/web/src/server/jobs/register.ts` and `apps/web/instrumentation.ts`

**Checkpoint**: Database-backed content works through ContentStore, migrations can
be applied safely, and job handlers can be registered explicitly.

---

## Phase 3: User Story 1 - Add Images While Editing a Page (Priority: P1) 🎯 MVP

**Goal**: Let Editor/Admin users upload, paste, or drop raster images into
Markdown; persist them in the Database backend; render them in preview/read views;
and enforce page-equivalent read permissions.

**Independent Test**: Upload and paste an image in the editor, verify the
`/api/assets/{id}` Markdown reference appears at the cursor, publish the page,
reload in another browser, and confirm authorized readers see the image while an
unauthorized caller receives 404.

### Tests for User Story 1

- [X] T022 [P] [US1] Add byte-sniffing tests for PNG/JPEG/GIF/WebP acceptance, SVG/type-confusion rejection, and size limits in `apps/web/src/server/services/content-assets.test.ts`
- [X] T023 [P] [US1] Add asset ownership, abandoned-upload expiry, reference tracking, shared-reference, and permission tests in `apps/web/src/server/services/content-assets-permissions.test.ts`
- [X] T024 [P] [US1] Run the ContentStore conformance suite against DatabaseStore in `apps/web/src/server/content-store/database-store.test.ts`
- [ ] T025 [P] [US1] Add route tests for upload responses, permission-hidden 404s, 423 migration lock, and unavailable-image placeholders in `apps/web/app/api/assets/assets.route.test.ts`
- [X] T026 [P] [US1] Add Playwright coverage for toolbar upload, clipboard paste, drag/drop, validation errors, preview rendering, publish persistence, and denied image access in `apps/web/e2e/content-images.spec.ts`

### Implementation for User Story 1

- [X] T027 [P] [US1] Implement magic-number image validation, hashing, and raster allowlist enforcement in `apps/web/src/server/content-store/image-validation.ts`
- [X] T028 [P] [US1] Implement Markdown asset-reference extraction for application-relative asset URLs in `apps/web/src/server/content-store/asset-references.ts`
- [X] T029 [US1] Implement upload lifecycle, temporary uploader access, reference synchronization, and soft orphan handling in `apps/web/src/server/services/content-assets.ts`
- [X] T030 [US1] Update page revision creation to synchronize `content_asset_refs` in the same DB transaction as revision metadata in `apps/web/src/server/services/pages.ts`
- [X] T031 [US1] Implement multipart image upload with Editor/Admin and API-key scope intersection checks in `apps/web/app/api/assets/route.ts`
- [X] T032 [US1] Implement permission-checked image streaming and no-store fallback placeholder responses in `apps/web/app/api/assets/[id]/route.ts`
- [X] T033 [P] [US1] Add the application-owned unavailable-image raster asset in `apps/web/public/images/content-unavailable.png`
- [X] T034 [P] [US1] Add a client multipart upload helper with typed API errors in `apps/web/src/lib/api/assets.ts`
- [X] T035 [US1] Add image toolbar, file picker, paste/drop handlers, upload progress, cursor insertion, and failure handling in `apps/web/src/components/editor/SplitMarkdownEditor.tsx`
- [X] T036 [P] [US1] Add English image upload, validation, migration-lock, and unavailable-content strings in `apps/web/src/i18n/locales/en.ts`
- [X] T037 [P] [US1] Add matching Chinese image upload, validation, migration-lock, and unavailable-content strings in `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: US1 works entirely with the default Database backend and is
deployable as the MVP without configuring Local, S3, or Git.

---

## Phase 4: User Story 2 - Admin Configures the Content Storage Backend (Priority: P2)

**Goal**: Let administrators configure and health-check Database, Local, and S3
authoritative backends plus an optional one-way Git export target without
restarting the application or exposing secrets.

**Independent Test**: Open `/admin/storage` as an admin, confirm Database is
active, save and health-check Local/S3 configuration, verify secrets are masked,
enable Git export, and confirm a non-admin receives the existing hidden admin
denial behavior.

### Tests for User Story 2

- [X] T038 [P] [US2] Run ContentStore conformance tests against LocalStore including traversal and namespace escape rejection in `apps/web/src/server/content-store/local-store.test.ts`
- [X] T039 [P] [US2] Run ContentStore conformance tests against MinIO-backed S3Store including prefix confinement in `apps/web/src/server/content-store/s3-store.test.ts`
- [X] T040 [P] [US2] Add storage configuration tests for encryption, secret masking/rotation, URL credential rejection, health checks, and admin-only access in `apps/web/src/server/services/storage-config.test.ts`
- [ ] T041 [P] [US2] Add Git export tests for initial backfill, publish/delete/rename reconciliation, stale-asset pruning, per-remote serialization, retry, and force-with-lease warnings in `apps/web/src/server/jobs/git-export.test.ts`
- [X] T042 [P] [US2] Add Playwright coverage for `/admin/storage`, Local/S3 forms, connection checks, secret masking, Git enablement, deep links, and non-admin denial in `apps/web/e2e/content-storage-admin.spec.ts`

### Implementation for User Story 2

- [X] T043 [P] [US2] Implement atomic file writes, managed-directory confinement, enumeration, deletion, and health probes in `apps/web/src/server/content-store/local-store.ts`
- [X] T044 [P] [US2] Implement S3 object operations, prefix confinement, pagination, deletion, and health probes in `apps/web/src/server/content-store/s3-store.ts`
- [X] T045 [US2] Register LocalStore and S3Store factories in `apps/web/src/server/content-store/registry.ts`
- [X] T046 [US2] Implement backend configuration CRUD, encryption/decryption, masked views, URL validation, and health checks in `apps/web/src/server/services/storage-config.ts`
- [X] T047 [US2] Implement admin-only storage configuration GET/PUT endpoints with OpenAPI metadata and API auditing in `apps/web/app/api/storage/route.ts`
- [X] T048 [US2] Implement ephemeral backend connection checks with OpenAPI metadata and API auditing in `apps/web/app/api/storage/backend-checks/route.ts`
- [ ] T049 [US2] Implement Git-export configuration enable/disable, encrypted token rotation, and backfill enqueueing in `apps/web/app/api/storage/git-export/route.ts`
- [ ] T050 [P] [US2] Implement standard Markdown/frontmatter and asset-tree materialization for the system-owned branch in `apps/web/src/server/git/export.ts`
- [ ] T051 [US2] Implement serialized/coalesced Git export jobs, retries, stale-file pruning, and force-with-lease warning persistence in `apps/web/src/server/jobs/git-export.ts`
- [ ] T052 [US2] Register Git export handling and enqueue export after publish, delete, and path changes in `apps/web/src/server/jobs/register.ts`, `apps/web/src/server/services/revisions.ts`, and `apps/web/src/server/services/pages.ts`
- [X] T053 [P] [US2] Build backend-specific forms, masked secret controls, health-check feedback, and Git export controls in `apps/web/src/components/admin/storage/StorageBackendForm.tsx`
- [X] T054 [P] [US2] Build the backend summary and active-backend presentation in `apps/web/src/components/admin/storage/StorageBackendSummary.tsx`
- [X] T055 [US2] Implement the canonical server-aware admin storage page and breadcrumbs in `apps/web/app/(admin)/admin/storage/page.tsx`
- [X] T056 [US2] Add Content Storage to the existing admin navigation in `apps/web/src/components/layout/Navigator.tsx`
- [X] T057 [P] [US2] Add matching English and Chinese backend, health-check, secret, Git export, and admin-navigation strings in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: US2 can configure and validate all supported storage methods; the
active authoritative backend remains Database until US3 performs a migration.

---

## Phase 5: User Story 3 - Safe Automatic Migration When Switching Backends (Priority: P2)

**Goal**: Copy, verify, and atomically cut over all revision Markdown and image
bytes while reads remain available, writes receive 423, abort is race-safe, and
old-backend cleanup is separately confirmed.

**Independent Test**: Populate Database storage, migrate to Local or S3, observe
progress, verify fingerprints and cutover, confirm reads throughout, induce
failure and abort races without changing the active backend, restart during a
migration and resume safely, then run confirmed cleanup only against an inactive
backend.

### Tests for User Story 3

- [X] T058 [P] [US3] Add migration-service tests for target validation, non-empty confirmation, single-flight locking, immediate read-only state, and enqueue failure recovery in `apps/web/src/server/services/migration.test.ts`
- [X] T059 [P] [US3] Add migration-job tests for copy/verify counters, fingerprint mismatch, failure retention, restart idempotency, cooperative abort checkpoints, and guarded cutover in `apps/web/src/server/jobs/content-migration.test.ts`
- [X] T060 [P] [US3] Add write-lock regression tests for page create, draft, publish, and asset upload while preserving reads in `apps/web/src/server/services/storage-read-only.test.ts`
- [X] T061 [P] [US3] Add cleanup-job tests for confirmation, active/in-use backend refusal, namespace confinement, progress, and partial deletion failure in `apps/web/src/server/jobs/storage-cleanup.test.ts`
- [X] T062 [P] [US3] Add orphan-cleanup tests for abandoned uploads, compensated-write leftovers, grace periods, and referenced revision preservation in `apps/web/src/server/jobs/orphan-cleanup.test.ts`
- [X] T063 [P] [US3] Add Playwright coverage for switch confirmation, migration progress/deep links, read availability, 423 write feedback, abort, failure/retry, and retained-backend cleanup in `apps/web/e2e/content-storage-migration.spec.ts`

### Implementation for User Story 3

- [X] T064 [US3] Implement migration creation, transactional single-flight/write lock, target checks, progress views, abort intent, and recovery queries in `apps/web/src/server/services/migration.ts`
- [X] T065 [US3] Implement idempotent copy, fingerprint/count verification, cooperative abort checkpoints, guarded cutover, and failure retention in `apps/web/src/server/jobs/content-migration.ts`
- [X] T066 [US3] Implement migration start/list endpoints with confirmation errors, OpenAPI metadata, and API auditing in `apps/web/app/api/storage/migrations/route.ts`
- [X] T067 [US3] Implement migration status GET and cooperative abort DELETE endpoints with OpenAPI metadata and API auditing in `apps/web/app/api/storage/migrations/[id]/route.ts`
- [X] T068 [US3] Apply the migration write guard to page create/draft paths in `apps/web/src/server/services/pages.ts`
- [X] T069 [US3] Apply the migration write guard to revision publish paths in `apps/web/src/server/services/revisions.ts`
- [X] T070 [US3] Apply the migration write guard to image uploads in `apps/web/src/server/services/content-assets.ts`
- [X] T071 [P] [US3] Implement inactive-backend cleanup with progress and safety checks in `apps/web/src/server/jobs/storage-cleanup.ts`
- [X] T072 [P] [US3] Implement bounded abandoned-upload and unreferenced-object cleanup in `apps/web/src/server/jobs/orphan-cleanup.ts`
- [X] T073 [US3] Implement cleanup start/status endpoints with confirmation, OpenAPI metadata, and API auditing in `apps/web/app/api/storage/cleanup-jobs/route.ts` and `apps/web/app/api/storage/cleanup-jobs/[id]/route.ts`
- [X] T074 [US3] Register migration, cleanup, orphan cleanup, and interrupted-job recovery handlers in `apps/web/src/server/jobs/register.ts`
- [X] T075 [P] [US3] Build backend switch confirmation and non-empty-target warning UI in `apps/web/src/components/admin/storage/BackendSwitchDialog.tsx`
- [X] T076 [P] [US3] Build migration progress, abort, retry, and cleanup controls in `apps/web/src/components/admin/storage/MigrationStatus.tsx`
- [X] T077 [US3] Implement the bookmarkable migration detail page and connect status polling in `apps/web/app/(admin)/admin/storage/migrations/[id]/page.tsx`
- [X] T078 [US3] Integrate switch, current migration, retained backend, and cleanup state into `apps/web/app/(admin)/admin/storage/page.tsx`
- [X] T079 [P] [US3] Add matching English and Chinese migration, read-only, abort, retry, and cleanup strings in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: US3 safely switches among Database, Local, and S3 with no read
downtime and no cutover before complete verification.

---

## Phase 6: User Story 4 - Govern Storage & Preference Operations via API Key Scopes (Priority: P3)

**Goal**: Add `storage` and `preferences` scopes, preserve scope ∩ role behavior,
allow scoped preference updates, and audit every key-authenticated call.

**Independent Test**: Use an admin-owned `storage` key to read configuration and
start migration; verify the same scope on a non-admin key is denied; update the
key owner's preferences with `preferences`; verify missing scopes return 403 and
all calls appear in audit logs.

### Tests for User Story 4

- [X] T080 [P] [US4] Add permission-matrix tests for `manage_storage` and self-only `manage_preferences` across session and API-key actors in `apps/web/src/server/permissions/permissions.test.ts`
- [X] T081 [P] [US4] Add API-key service tests for creating, listing, revealing, and validating keys carrying the new immutable scopes in `apps/web/src/server/services/api-keys.test.ts`
- [X] T082 [P] [US4] Add preference-service tests for scoped API-key self-updates and missing-scope denial in `apps/web/src/server/services/user-center.test.ts`
- [X] T083 [P] [US4] Add Playwright/API coverage for scope selection, storage role intersection, preference updates, 403 responses, and audit entries in `apps/web/e2e/content-storage-scopes.spec.ts`

### Implementation for User Story 4

- [X] T084 [P] [US4] Add `storage` and `preferences` to shared API-key schemas and labels in `packages/shared/src/api-keys.ts`
- [X] T085 [US4] Append the new PostgreSQL enum values through an additive Drizzle migration in `apps/web/src/server/db/schema/enums.ts` and `apps/web/src/server/db/migrations/`
- [X] T086 [US4] Add storage/preferences resources, actions, scope mappings, and role rules to the permission chokepoint in `apps/web/src/server/permissions/index.ts`
- [X] T087 [US4] Enforce `manage_preferences` while allowing API-key self-service in `apps/web/src/server/services/user-center.ts` and `apps/web/app/api/user/preferences/route.ts`
- [X] T088 [US4] Apply `manage_storage` and `withApiAudit` consistently across every route under `apps/web/app/api/storage/`
- [X] T089 [P] [US4] Add the two scopes to API-key creation and list ordering in `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx` and `apps/web/src/components/user-center/ApiKeyList.tsx`
- [X] T090 [P] [US4] Add English and Chinese scope names/descriptions in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`
- [X] T091 [US4] Register storage schemas and scope security metadata for OpenAPI generation in `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/openapi-gen.config.ts`

**Checkpoint**: US4 provides bounded, auditable automation access without granting
permissions beyond the key owner's role.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature, generated API contract, deployment,
security boundaries, and bilingual UX.

- [ ] T092 [P] Add structured logging fields for backend type, migration/job IDs, asset IDs, progress, and sanitized failures in `apps/web/src/server/logger.ts`
- [ ] T093 [P] Document Local volume, MinIO profile, Git branch ownership, backup/restore, migration recovery, and cleanup operations in `specs/003-content-storage-backends/quickstart.md`
- [X] T094 Generate and review the OpenAPI document after all route changes by running `pnpm --filter @next-wiki/web openapi:generate` and updating `apps/web/public/openapi.json`
- [ ] T095 Run `pnpm --filter @next-wiki/web test` and fix all ContentStore, service, permission, job, and route failures in `apps/web/src/`
- [ ] T096 Run `pnpm --filter @next-wiki/web test:e2e` and fix all image, admin storage, migration, scope, navigation, and API documentation failures in `apps/web/e2e/`
- [ ] T097 Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`, fixing violations in `apps/web/` and `packages/shared/`
- [ ] T098 Run the required deployment verification with `docker compose up -d --build`, then verify `/healthz`, `/readyz`, Database-default image serving, and pg-boss startup against `docker-compose.yml`
- [ ] T099 Verify all new English keys have Chinese counterparts and no new user-facing literals bypass i18n in `apps/web/src/i18n/locales/en.ts`, `apps/web/src/i18n/locales/zh.ts`, and `apps/web/src/components/`
- [ ] T100 Review namespace confinement, URL credential rejection, secret masking, permission-hidden 404s, SVG rejection, cleanup safety, and force-with-lease warnings against `specs/003-content-storage-backends/spec.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: No dependencies.
- **Phase 2 — Foundation**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 — US1**: Depends on Phase 2; this is the MVP.
- **Phase 4 — US2**: Depends on Phase 2 and can proceed in parallel with US1.
- **Phase 5 — US3**: Depends on US1 asset persistence/reference tracking and US2
  alternative backend configuration.
- **Phase 6 — US4**: Core scope/schema/permission work depends only on Phase 2;
  full storage endpoint integration depends on US2 and US3 routes.
- **Phase 7 — Polish**: Depends on every story selected for release.

### User Story Dependency Graph

```text
Setup → Foundation ─┬─→ US1 (P1, MVP) ─┐
                    ├─→ US2 (P2) ──────┼─→ US3 (P2)
                    └─→ US4 core (P3)  │
                                       └─→ US4 storage integration

US1 + US2 + US3 + US4 → Polish
```

### Within Each User Story

- Write the listed tests first and confirm they fail for the intended reason.
- Implement models/infrastructure before services.
- Implement services before route handlers and UI integration.
- Add OpenAPI metadata and auditing with each API route.
- Complete the independent test before advancing to dependent stories.

### Parallel Opportunities

- T002–T004 can run in parallel after dependency installation is understood.
- T006–T008 and T013 can run in parallel during foundation work.
- US1 and US2 can be assigned to separate developers after Phase 2.
- US1 tests T022–T026 and implementation helpers T027–T028 can run in parallel.
- US2 tests T038–T042, stores T043–T044, Git materialization T050, and UI
  components T053–T054 can run in parallel.
- US3 tests T058–T063, cleanup handlers T071–T072, and UI components T075–T076
  can run in parallel.
- US4 tests T080–T083 and UI/shared schema work T084, T089, T090 can run in
  parallel.
- T092–T093 can run in parallel before final generated-doc and verification
  tasks.

---

## Parallel Example: User Story 1

```text
Task T022: Image byte validation tests
Task T023: Asset ownership/reference permission tests
Task T024: DatabaseStore conformance tests
Task T025: Asset route tests
Task T026: Image editor E2E tests
```

## Parallel Example: User Story 2

```text
Task T038: LocalStore conformance tests
Task T039: S3Store conformance tests
Task T040: Storage configuration service tests
Task T041: Git export job tests
Task T042: Admin storage E2E tests
```

## Parallel Example: User Story 3

```text
Task T058: Migration service tests
Task T059: Migration worker tests
Task T060: Read-only guard regression tests
Task T061: Retained-backend cleanup tests
Task T062: Orphan cleanup tests
Task T063: Migration E2E tests
```

## Parallel Example: User Story 4

```text
Task T080: Permission matrix tests
Task T081: API-key service tests
Task T082: Preference service tests
Task T083: Scope/audit E2E tests
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundation.
2. Complete US1 tests and Database-backed image implementation.
3. Stop and validate upload, paste, drag/drop, preview, publish persistence, and
   permission enforcement.
4. Deploy/demo without requiring Local, S3, MinIO, or Git.

### Incremental Delivery

1. **MVP**: Foundation + US1 — Database-backed editor images.
2. **Backend configuration**: US2 — Local/S3 health checks and Git export.
3. **Safe switching**: US3 — migration, abort, recovery, and cleanup.
4. **Automation governance**: US4 — new scopes, role intersection, and auditing.
5. **Release hardening**: generated OpenAPI, complete tests, build, and Docker
   Compose verification.

### Parallel Team Strategy

1. Team completes Setup and Foundation together.
2. Developer A implements US1 while Developer B implements US2.
3. Developer C starts US4 schema/permission work after Foundation.
4. US3 begins when US1 asset persistence and US2 target stores are available.
5. Integrate US4 storage-route checks after US2/US3 endpoints exist.

---

## Notes

- `[P]` tasks must not modify the same file concurrently.
- User-story labels provide traceability to `spec.md`.
- The existing `.gitignore` change is unrelated and is not part of this task list.
- Database-backed behavior remains the zero-configuration default.
- Only Editor or Admin roles may create or edit page content.
- API changes must regenerate `apps/web/public/openapi.json` through
  `next-openapi-gen`.
- Project-level verification must use `docker compose up -d --build`.
