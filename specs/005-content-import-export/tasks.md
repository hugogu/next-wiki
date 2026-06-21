# Tasks: Content Import and Export

**Input**: Design documents from `/specs/005-content-import-export/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The specification and quickstart define required security, integration,
and end-to-end verification, so test-first tasks are included in every user story.

**Organization**: Tasks are grouped by user story so each increment can be
implemented and validated with explicit dependencies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and does not
  depend on an incomplete task in the same phase.
- **[Story]**: Maps the task to a user story from `spec.md`.
- Every task names the exact implementation or test path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the bounded dependencies and create the transfer module
boundaries before shared infrastructure is implemented.

- [ ] T001 Add `yazl`, `yauzl`, `yaml`, `turndown`, and `ipaddr.js` plus required type packages to `apps/web/package.json` and `pnpm-lock.yaml`
- [ ] T002 [P] Create transfer module barrel files and explicit directory boundaries in `apps/web/src/server/transfers/index.ts`, `apps/web/src/server/transfers/converters/index.ts`, and `apps/web/src/components/admin/transfers/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish schemas, persistence, permissions, configuration,
artifact storage, and job registration required by every story.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [ ] T003 Define transfer enums, manifest schemas, request schemas, response views, pagination schemas, and stable error codes in `packages/shared/src/transfers.ts`, then export them from `packages/shared/src/index.ts`
- [ ] T004 [P] Add transfer PostgreSQL enum declarations to `apps/web/src/server/db/schema/enums.ts`
- [ ] T005 Add `transfer_sources`, `transfer_runs`, `transfer_items`, `transfer_artifacts`, `transfer_page_mappings`, and `transfer_asset_mappings` with relations, indexes, and the active-mutation partial unique index to `apps/web/src/server/db/schema/index.ts`
- [ ] T006 Generate and review migration `apps/web/src/server/db/migrations/0016_content_transfers.sql` and its Drizzle metadata under `apps/web/src/server/db/migrations/meta/`
- [ ] T007 [P] Add artifact retention, archive limits, remote-fetch limits, concurrency limits, and `TRANSFER_ARTIFACT_BASE_PATH` configuration to `apps/web/src/server/config.ts`, `docker-compose.yml`, and `.env.example`
- [ ] T008 [P] Add the admin-only `manage_transfers` action/resource and API-key scope intersection rules to `apps/web/src/server/permissions/index.ts` and `packages/shared/src/api-keys.ts`
- [ ] T009 [P] Add permission coverage for admin sessions, editors, readers, anonymous actors, and API keys in `apps/web/src/server/permissions/transfer-permissions.test.ts`
- [ ] T010 Implement opaque storage keys, `.partial` writes, bounded streaming, SHA-256 hashing, atomic finalize, range reads, deletion, and missing-file convergence in `apps/web/src/server/transfers/artifact-store.ts`
- [ ] T011 [P] Implement archive/source/converter explicit registration and lookup without filesystem discovery in `apps/web/src/server/transfers/registry.ts`
- [ ] T012 Implement credential encryption/redaction and source CRUD primitives in `apps/web/src/server/services/transfer-sources.ts`
- [ ] T013 Implement artifact reservation, ownership checks, streamed upload finalization, metadata views, retention guards, and deletion in `apps/web/src/server/services/transfer-artifacts.ts`
- [ ] T014 Implement run creation, list/detail/item pagination, state transitions, progress counters, preview linkage, mutation-slot acquisition, and sanitized diagnostics in `apps/web/src/server/services/transfers.ts`
- [ ] T015 Integrate transfer mutation exclusion with active content-storage migrations in `apps/web/src/server/services/transfers.ts` and `apps/web/src/server/services/migration.ts`
- [ ] T016 Add transfer queue names, enqueue helpers, boot recovery, worker handlers, and cleanup scheduling to `apps/web/src/server/jobs/runtime.ts` and `apps/web/src/server/jobs/register.ts`
- [ ] T017 [P] Create reusable database, archive, image, actor, and Wiki.js HTTP fixtures in `apps/web/test/transfer-fixtures.ts` and `apps/web/test/wikijs-fixture.ts`

**Checkpoint**: Transfer records, artifacts, authorization, and queues are ready;
story work can begin.

---

## Phase 3: User Story 1 - Export a Portable Wiki Archive (Priority: P1) 🎯 MVP

**Goal**: Let an administrator create, monitor, and download a portable ZIP of
all published pages and referenced local images.

**Independent Test**: Export nested multilingual published pages with shared
images, drafts, deleted pages, internal links, and external images; verify the
manifest, Markdown, checksums, deduplication, exclusions, status, and admin-only
download without using any import feature.

### Tests for User Story 1

- [ ] T018 [P] [US1] Add manifest/frontmatter round-trip, deterministic ordering, path encoding, and compatibility tests in `apps/web/src/server/transfers/manifest.test.ts`
- [ ] T019 [P] [US1] Add streaming ZIP generation, checksum, shared-image deduplication, bounded-memory, and atomic-finalize tests in `apps/web/src/server/transfers/archive-writer.test.ts`
- [ ] T020 [P] [US1] Add export snapshot tests covering published-only selection, revision consistency, unavailable assets, and external-image warnings in `apps/web/src/server/jobs/transfer-export.test.ts`
- [ ] T021 [P] [US1] Add admin-only export creation, status, artifact metadata, and download route tests in `apps/web/app/api/transfers/transfers-export.test.ts`

### Implementation for User Story 1

- [ ] T022 [P] [US1] Implement YAML frontmatter serialization, archive v1 manifest construction, deterministic inventory ordering, and integrity metadata in `apps/web/src/server/transfers/manifest.ts`
- [ ] T023 [P] [US1] Implement AST-based local asset discovery plus portable page/asset link rewriting in `apps/web/src/server/transfers/markdown-links.ts`
- [ ] T024 [US1] Implement a consistent published-page/revision snapshot and source Markdown/image reads through existing content stores in `apps/web/src/server/services/transfer-export.ts`
- [ ] T025 [US1] Implement streaming archive creation with content-addressed assets and `reports/export.json` in `apps/web/src/server/transfers/archive-writer.ts`
- [ ] T026 [US1] Implement progress, warning/item outcomes, cancellation checkpoints, artifact finalization, and report linkage in `apps/web/src/server/jobs/transfer-export.ts`
- [ ] T027 [US1] Add export run creation/list endpoints with OpenAPI annotations in `apps/web/app/api/transfers/route.ts`
- [ ] T028 [US1] Add transfer detail and item outcome endpoints with OpenAPI annotations in `apps/web/app/api/transfers/[id]/route.ts` and `apps/web/app/api/transfers/[id]/items/route.ts`
- [ ] T029 [US1] Add artifact metadata and permission-scoped ZIP/report streaming endpoints with range support and OpenAPI annotations in `apps/web/app/api/transfer-artifacts/[id]/route.ts` and `apps/web/app/api/transfer-artifacts/[id]/content/route.ts`
- [ ] T030 [P] [US1] Build the URL-backed transfer admin tabs and exports panel using shared settings/table/dialog components in `apps/web/src/components/admin/transfers/TransferAdminTabs.tsx` and `apps/web/src/components/admin/transfers/ExportPanel.tsx`
- [ ] T031 [US1] Add the admin collection page with export controls and recent run status at `apps/web/app/(admin)/admin/transfers/page.tsx`

**Checkpoint**: US1 is deployable as a complete backup/export MVP.

---

## Phase 4: User Story 2 - Restore a Wiki from a Portable Archive (Priority: P1)

**Goal**: Validate an uploaded archive, preview its effects, and restore pages
and images with skip/replace conflict behavior and retry-safe item writes.

**Independent Test**: Import a valid portable archive into an empty site, then
repeat against conflicting content with both strategies; verify exact Markdown,
metadata, local images, preserved prior revisions, idempotent retry, and zero
mutation for every unsafe archive fixture.

### Tests for User Story 2

- [ ] T032 [P] [US2] Add raw ZIP upload tests for byte limits, interrupted overwrite, ownership, hashing, atomic finalize, and invalid media type in `apps/web/src/server/services/transfer-artifacts.test.ts`
- [ ] T033 [P] [US2] Add malicious archive tests for traversal, absolute/backslash paths, symlinks, duplicate normalized paths, undeclared files, truncation, zip bombs, count limits, and checksum mismatch in `apps/web/src/server/transfers/archive-reader.test.ts`
- [ ] T034 [P] [US2] Add preview planning tests for counts, conflicts, unsupported entries, stale fingerprints, and default skip behavior in `apps/web/src/server/jobs/transfer-preview.test.ts`
- [ ] T035 [P] [US2] Add archive apply tests for create/skip/replace, revision preservation, asset deduplication, atomic item failure, link rewriting, resume, and retry in `apps/web/src/server/jobs/transfer-import.test.ts`
- [ ] T036 [P] [US2] Add archive upload/preview/import authorization and API contract tests in `apps/web/app/api/transfers/transfers-archive-import.test.ts`

### Implementation for User Story 2

- [ ] T037 [US2] Add upload artifact reservation and raw ZIP streaming endpoints with OpenAPI annotations in `apps/web/app/api/transfer-artifacts/route.ts` and `apps/web/app/api/transfer-artifacts/[id]/content/route.ts`
- [ ] T038 [US2] Implement lazy central-directory inspection, normalized path validation, manifest-first declaration checks, streamed integrity checks, and archive safety limits in `apps/web/src/server/transfers/archive-reader.ts`
- [ ] T039 [US2] Implement archive preview planning, canonical `(space, path, locale)` conflict classification, projected actions, and immutable preview items in `apps/web/src/server/jobs/transfer-preview.ts`
- [ ] T040 [US2] Implement transaction-safe imported page creation/replacement that reuses rendering, revision publication, asset refs, replication, Git export, and AI-index reconciliation in `apps/web/src/server/services/transfer-page-writer.ts`
- [ ] T041 [US2] Implement content-addressed imported asset writes, mapping reuse, and reference-safe rollback behavior in `apps/web/src/server/services/transfer-asset-writer.ts`
- [ ] T042 [US2] Implement archive import execution, preview fingerprint enforcement, per-item idempotency mappings, cancellation checkpoints, and final report generation in `apps/web/src/server/jobs/transfer-import.ts`
- [ ] T043 [US2] Extend transfer run creation validation to support archive preview/import and stale-plan rejection in `apps/web/src/server/services/transfers.ts`
- [ ] T044 [P] [US2] Build streamed upload, validation progress, preview summary, conflict strategy, warning, and confirmation UI in `apps/web/src/components/admin/transfers/ArchiveImportPanel.tsx` and `apps/web/src/components/admin/transfers/TransferPreview.tsx`
- [ ] T045 [US2] Wire the archive import tab, URL-backed conflict strategy, and refresh-after-start behavior into `apps/web/app/(admin)/admin/transfers/page.tsx`

**Checkpoint**: US1 + US2 provide a complete portable export/restore workflow.

---

## Phase 5: User Story 3 - Import All Content from Wiki.js (Priority: P2)

**Goal**: Configure a Wiki.js source, test it, preview all accessible published
pages, convert supported content, localize images, and import through the same
safe apply pipeline.

**Independent Test**: Import a Wiki.js fixture with Markdown, CKEditor HTML,
locales, nested paths, tags, shared/same-origin/cross-origin images, inaccessible
images, permission-limited pages, and unsupported content; disconnect the source
and verify imported pages remain complete and local.

### Tests for User Story 3

- [ ] T046 [P] [US3] Add source CRUD, encrypted credential, masked response, private-network trust, deletion, and token-redaction tests in `apps/web/src/server/services/transfer-sources.test.ts`
- [ ] T047 [P] [US3] Add Wiki.js GraphQL inventory/source, pagination/order, permission, malformed response, authentication, timeout, and retry tests in `apps/web/src/server/transfers/wikijs-client.test.ts`
- [ ] T048 [P] [US3] Add Markdown identity, CKEditor HTML conversion, sanitization, tables/code/images, and unsupported-format tests in `apps/web/src/server/transfers/converters/converters.test.ts`
- [ ] T049 [P] [US3] Add SSRF tests for loopback/private/link-local/IPv4-mapped IPv6, redirects, DNS changes, private-host opt-in, byte/time limits, media validation, and cross-origin token stripping in `apps/web/src/server/transfers/remote-fetch.test.ts`
- [ ] T050 [P] [US3] Add Wiki.js source-test/preview/import tests for permission-limited discovery, conversion reporting, asset localization, conflicts, and idempotency in `apps/web/src/server/jobs/transfer-wikijs.test.ts`
- [ ] T051 [P] [US3] Add transfer source and Wiki.js run API authorization/contract tests in `apps/web/app/api/transfer-sources/transfer-sources.test.ts`

### Implementation for User Story 3

- [ ] T052 [P] [US3] Implement Markdown identity conversion and conversion metadata in `apps/web/src/server/transfers/converters/markdown.ts`
- [ ] T053 [P] [US3] Implement sanitized CKEditor/HTML-to-Markdown conversion with explicit supported element rules in `apps/web/src/server/transfers/converters/html.ts`
- [ ] T054 [US3] Register the supported content converters and unsupported-format outcomes in `apps/web/src/server/transfers/registry.ts`
- [ ] T055 [US3] Implement SSRF-safe bounded HTTP with protocol validation, DNS/address checks, redirect revalidation, validated-address connection, same-host private trust, and credential isolation in `apps/web/src/server/transfers/remote-fetch.ts`
- [ ] T056 [US3] Implement fixed Wiki.js GraphQL queries, bearer authentication, page inventory/source validation, stable fingerprints, normalized errors, and capped retries in `apps/web/src/server/transfers/wikijs-client.ts`
- [ ] T057 [US3] Implement source connection testing and sanitized health-state persistence in `apps/web/src/server/jobs/transfer-source-test.ts`
- [ ] T058 [US3] Implement Wiki.js discovery/preview planning, supported conversion classification, permission-limit notices, link mapping, and referenced-image inventory in `apps/web/src/server/jobs/transfer-preview.ts`
- [ ] T059 [US3] Implement authenticated same-origin and unauthenticated cross-origin image localization, SHA-256 deduplication, media validation, unresolved-reference reporting, and target URL rewriting in `apps/web/src/server/services/transfer-wikijs-assets.ts`
- [ ] T060 [US3] Extend import execution for Wiki.js page conversion, image localization, mappings, conflict plans, and source fingerprint enforcement in `apps/web/src/server/jobs/transfer-import.ts`
- [ ] T061 [US3] Add source collection/create endpoints with masked credentials and OpenAPI annotations in `apps/web/app/api/transfer-sources/route.ts`
- [ ] T062 [US3] Add source detail/update/delete endpoints with active-run guards and OpenAPI annotations in `apps/web/app/api/transfer-sources/[id]/route.ts`
- [ ] T063 [US3] Extend transfer run creation for source test, Wiki.js preview, and Wiki.js import in `apps/web/app/api/transfers/route.ts`
- [ ] T064 [P] [US3] Build Wiki.js source list/form/test controls and preview/import workflow with shared modal, table, input, and status components in `apps/web/src/components/admin/transfers/WikiJsSourcePanel.tsx`
- [ ] T065 [US3] Wire URL-backed Wiki.js source selection and migration controls into `apps/web/app/(admin)/admin/transfers/page.tsx`

**Checkpoint**: US3 can migrate all supported Wiki.js content without relying on
the source after completion.

---

## Phase 6: User Story 4 - Audit and Manage Migration Runs (Priority: P2)

**Goal**: Preserve durable run history with detailed outcomes, cancellation,
retry, retention, artifact management, and credential-safe audit records.

**Independent Test**: Create successful, warning, failed, cancelled, expired,
and retried runs; leave and return; verify durable progress/history, item-level
diagnostics, reports, cancellation semantics, cleanup, and absence of plaintext
credentials.

### Tests for User Story 4

- [ ] T066 [P] [US4] Add durable progress, boot recovery, cancellation, retry lineage, active mutation exclusion, and completed-item reuse tests in `apps/web/src/server/services/transfers.test.ts`
- [ ] T067 [P] [US4] Add retention cleanup, active-reference protection, early deletion, expired metadata, partial-file cleanup, and missing-file convergence tests in `apps/web/src/server/jobs/transfer-cleanup.test.ts`
- [ ] T068 [P] [US4] Add audit tests for source, run, cancellation, retry, download, and deletion events with credential/body redaction in `apps/web/src/server/services/transfer-audit.test.ts`
- [ ] T069 [P] [US4] Add run history/detail, item filtering, cancellation, retry, artifact deletion, and report download API tests in `apps/web/app/api/transfers/transfers-operations.test.ts`
- [ ] T070 [P] [US4] Add Playwright coverage for refresh persistence, deep links, URL-backed filters/tabs, cancellation dialogs, retry, and report download in `apps/web/e2e/transfers.spec.ts`

### Implementation for User Story 4

- [ ] T071 [US4] Implement cancellation requests, retry-run creation from incomplete items, retry eligibility, recovery queries, and historical lineage in `apps/web/src/server/services/transfers.ts`
- [ ] T072 [US4] Add cancellation and retry endpoints with stable conflict responses and OpenAPI annotations in `apps/web/app/api/transfers/[id]/cancellation/route.ts` and `apps/web/app/api/transfers/[id]/retries/route.ts`
- [ ] T073 [US4] Implement retention expiry, safe artifact deletion, orphan `.partial` cleanup, and scheduled convergence in `apps/web/src/server/jobs/transfer-cleanup.ts`
- [ ] T074 [US4] Add structured audit events and redaction for all transfer source/run/artifact actions in `apps/web/src/server/services/transfer-audit.ts` and `apps/web/src/server/api/audit-wrapper.ts`
- [ ] T075 [P] [US4] Build run list filters, pagination, progress polling, status badges, cancellation/retry confirmations, and artifact actions in `apps/web/src/components/admin/transfers/TransferRunList.tsx`
- [ ] T076 [P] [US4] Build paginated item outcomes, sanitized failure details, counters, source/options summary, and report links in `apps/web/src/components/admin/transfers/TransferRunDetail.tsx`
- [ ] T077 [US4] Add the canonical deep-linkable run detail page at `apps/web/app/(admin)/admin/transfers/[id]/page.tsx`
- [ ] T078 [US4] Wire history filters, selected source, pagination, and active tab to URL search parameters in `apps/web/app/(admin)/admin/transfers/page.tsx`

**Checkpoint**: All transfer operations are durable, diagnosable, cancellable,
retryable, and auditable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finish localization, generated API documentation, end-to-end
hardening, deployment validation, and operational documentation.

- [ ] T079 [P] Add complete English transfer navigation, forms, statuses, previews, warnings, errors, reports, and accessibility text to `apps/web/src/i18n/locales/en.ts`
- [ ] T080 [P] Add complete Chinese transfer navigation, forms, statuses, previews, warnings, errors, reports, and accessibility text to `apps/web/src/i18n/locales/zh.ts`
- [ ] T081 Add localized transfer keys to type-safe translation declarations in `apps/web/src/i18n/types.ts`
- [ ] T082 [P] Add migration center navigation for administrators to `apps/web/src/components/layout/Navigator.tsx`
- [ ] T083 Regenerate and review transfer REST documentation with `next-open-api` in `apps/web/public/openapi.json`
- [ ] T084 [P] Add schema/migration integrity coverage for all transfer tables, constraints, and indexes in `apps/web/src/server/db/transfer-schema.test.ts`
- [ ] T085 [P] Add a portable archive export-to-empty-target round-trip integration suite in `apps/web/src/server/transfers/portable-roundtrip.test.ts`
- [ ] T086 [P] Add 1,000-page/5,000-image streaming, progress, and memory regression coverage in `apps/web/src/server/transfers/transfer-performance.test.ts`
- [ ] T087 Run and fix `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm --filter @next-wiki/web test:e2e` against the implementation paths listed in `specs/005-content-import-export/quickstart.md`
- [ ] T088 Run `docker compose up -d --build`, verify migration/worker registration, restart recovery, artifact persistence, and logs without secrets, then record results in `specs/005-content-import-export/quickstart.md`
- [ ] T089 Document archive v1 operation, retention, Wiki.js permissions, private-network trust, backup/restore, and failure recovery in `docs/content-import-export.md`
- [ ] T090 Perform final requirement traceability for FR-001 through FR-032 and SC-001 through SC-008 in `specs/005-content-import-export/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 — US1 Export**: Depends on Phase 2; this is the first deployable MVP.
- **Phase 4 — US2 Archive Restore**: Depends on Phase 2. It can use archive
  fixtures before US1 is complete, but the full round trip also validates US1.
- **Phase 5 — US3 Wiki.js Import**: Depends on Phase 2 and the page/asset apply
  services from T040–T042.
- **Phase 6 — US4 Operations**: Depends on Phase 2. Its generic run management
  can begin early, but complete acceptance requires the run kinds from US1–US3.
- **Phase 7 — Polish**: Depends on every story selected for release.

### User Story Dependency Graph

```text
Setup
  └── Foundational
      ├── US1 Export ───────────────┐
      ├── US2 Archive Restore ──────┼── US4 Full Operations ── Polish
      │       └── US3 Wiki.js Import┘
      └── US4 Run Framework (partial)
```

### Within Each User Story

- Write the story's tests first and confirm they fail for the intended reason.
- Implement codecs/adapters before services, services before jobs, and jobs
  before route/UI integration.
- Complete the independent test before moving the story checkpoint.
- Keep page and asset writes atomic; never hold database transactions across
  ZIP or remote network I/O.

## Parallel Opportunities

- T002 can run alongside dependency installation after the intended package
  names are fixed.
- In Phase 2, T004, T007, T008, T009, T011, and T017 touch independent areas.
- Every story's initial test tasks marked `[P]` can be authored concurrently.
- US1 manifest/link modules (T022–T023) and UI (T030) can proceed in parallel.
- US2 upload/reader tests and apply tests (T032–T036) can proceed in parallel.
- US3 converter, GraphQL, SSRF, job, and API test tracks (T046–T051) can proceed
  in parallel; converter implementations T052–T053 are independent.
- US4 service, cleanup, audit, API, and Playwright tests (T066–T070) can proceed
  in parallel; list and detail UI (T075–T076) are independent.
- Localization, navigation, schema tests, round-trip tests, and performance
  tests in Phase 7 can proceed in parallel before final verification.

## Parallel Examples

### User Story 1

```text
Task T018: Manifest/frontmatter compatibility tests
Task T019: Streaming archive writer tests
Task T020: Export snapshot/job tests
Task T021: Export API authorization tests
```

### User Story 2

```text
Task T032: Streamed upload tests
Task T033: Unsafe archive reader tests
Task T034: Preview planning tests
Task T035: Import atomicity/idempotency tests
Task T036: Archive API contract tests
```

### User Story 3

```text
Task T046: Source and credential tests
Task T047: Wiki.js GraphQL client tests
Task T048: Converter tests
Task T049: SSRF and remote-fetch tests
Task T050: Wiki.js job integration tests
Task T051: Source API tests
```

### User Story 4

```text
Task T066: Run lifecycle and recovery tests
Task T067: Retention cleanup tests
Task T068: Audit/redaction tests
Task T069: Operations API tests
Task T070: Admin operations Playwright tests
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 through T031.
3. Validate the independent export scenario and deploy a backup-only MVP.
4. Add US2 to prove portability with archive restore.

### Incremental Delivery

1. **Foundation**: schemas, storage, permissions, queue registration.
2. **US1**: export and download a portable archive.
3. **US2**: upload, preview, and restore the archive.
4. **US3**: migrate supported Wiki.js content and images.
5. **US4**: complete operational history, cancellation, retries, and retention.
6. **Polish**: localization, OpenAPI, full tests, Docker validation, docs.

### Recommended Commit Boundaries

- Commit Phase 1–2 foundation after schema and permission tests pass.
- Commit each user story at its checkpoint with its focused tests.
- Commit generated OpenAPI and final docs only after implementation routes are
  stable.

## Notes

- `[P]` means different files and no dependency on an unfinished task.
- Story labels provide traceability to the four user stories in `spec.md`.
- API changes are incomplete until `apps/web/public/openapi.json` is regenerated
  with `next-open-api`.
- Use `docker compose up -d --build` for deployment verification.
- Only administrators may use transfer administration even though normal page
  editing remains available to editors and administrators.
