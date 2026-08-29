# Tasks: OpenClaw Memory Wiki Integration

**Input**: Design documents from `/specs/040-openclaw-memory-wiki/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[quickstart.md](./quickstart.md),
[contracts/openclaw-memory-wiki-rest-api.md](./contracts/openclaw-memory-wiki-rest-api.md),
and [contracts/openclaw-plugin-contract.md](./contracts/openclaw-plugin-contract.md)

**Tests**: Tests are required by the feature specification and repository
policy. Write each listed test before its implementation task and demonstrate
that it fails for the intended missing behavior first.

**Organization**: The foundation establishes server-bound paired credentials,
path-aware immutable snapshots, and no-store public API rules. User stories
then deliver the mirror, account-wide retrieval, safe operation, onboarding,
and privacy/audit guarantees in independently verifiable increments.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the separately distributable external OpenClaw package and
the test/release scaffolding without putting an OpenClaw runtime in the Wiki
web deployment.

- [ ] T001 [P] Create the ESM package scaffold, Node 22.22.3+ engine, compiled-package `files` allowlist, package scripts, build/test configs, and source/Skill directories in `packages/openclaw-memory-wiki/package.json`, `packages/openclaw-memory-wiki/tsconfig.json`, `packages/openclaw-memory-wiki/tsup.config.ts`, `packages/openclaw-memory-wiki/vitest.config.ts`, and `packages/openclaw-memory-wiki/skills/next-wiki/SKILL.md`.
- [ ] T002 [P] Create the strict native-plugin manifest with startup activation, SecretRef config contracts, sensitive-input hints, bundled Skill registration, and four declared tool contracts in `packages/openclaw-memory-wiki/openclaw.plugin.json`.
- [ ] T003 [P] Add reusable local OpenClaw API mocks, a fixture Memory Wiki vault, and package-test setup utilities in `packages/openclaw-memory-wiki/tests/fixtures/openclaw.ts`, `packages/openclaw-memory-wiki/tests/fixtures/memory-wiki-vault.ts`, and `packages/openclaw-memory-wiki/tests/setup.ts`.
- [ ] T004 [P] Create the tag-triggered package publication workflow with frozen install, build, test, lint, typecheck, npm provenance publishing, and controlled ClawHub dry-run guidance in `.github/workflows/publish-openclaw-memory-wiki.yml`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared contracts, schema migration, binding-purpose
authorization, paired-key creation, immutable Raw snapshot writer, and
content-free API/audit boundary required by every user story.

**⚠️ CRITICAL**: No user-story route or plugin work starts until this phase is
complete. No client may choose an account, namespace, remote path, Raw page,
or authorization scope through a mirror request.

- [ ] T005 [P] Add failing shared-schema serialization and validation coverage for OpenClaw paired-key provisioning, mirror connection, document snapshots, citations, bounded search, and coverage responses in `packages/shared/src/api-keys.test.ts` and `packages/shared/src/agent-memory.test.ts`.
- [ ] T006 [P] Add failing schema/index coverage for binding purposes, the generic `source_document` Agent Memory record type, and its Page/current-Revision relationship in `apps/web/src/server/db/agent-memory-schema.test.ts`.
- [ ] T007 [P] Add failing authorization and paired-key service coverage for wrong-purpose keys, missing scopes, mixed owners/namespaces, Raw/Generated Admin-only grants, revocation, and disabled destinations in `apps/web/src/server/permissions/agent-memory.test.ts` and `apps/web/src/server/services/api-keys.test.ts`.
- [ ] T008 [P] Add failing full-snapshot Raw writer, public-error/no-store, audit-redaction, and OpenAPI registration coverage in `apps/web/src/server/services/raw-entries.test.ts`, `apps/web/src/server/api/audit-wrapper.test.ts`, and `apps/web/src/server/api/openapi-schemas.test.ts`.
- [ ] T009 Define bounded OpenClaw paired-key, mirror document, connection, search/read, coverage, citation, and error DTOs plus public exports in `packages/shared/src/api-keys.ts`, `packages/shared/src/agent-memory.ts`, and `packages/shared/src/index.ts`.
- [ ] T010 Define the `memory_provider`, `mirror`, and `knowledge_search` binding-purpose enum and the generic `source_document` Agent Memory record type; retain the existing `agent_memory_records → pages → page_revisions` relationship without creating an OpenClaw-only table in `apps/web/src/server/db/schema/enums.ts`, `apps/web/src/server/db/schema/agent-memory.ts`, and `apps/web/src/server/db/schema/index.ts`.
- [ ] T011 Generate the database migration with `pnpm db:generate` after T010; commit only generated files in `apps/web/src/server/db/migrations/*.sql`, `apps/web/src/server/db/migrations/meta/*.json`, and `apps/web/src/server/db/migrations/meta/_journal.json`; rerun the command and confirm it reports no schema changes.
- [ ] T012 Implement binding-purpose-aware access resolution, paired-key ownership/namespace validation, and mirror-versus-knowledge route guards in `apps/web/src/server/permissions/agent-memory.ts` and `apps/web/src/server/permissions/index.ts`.
- [ ] T013 Implement the owner-session-only, reveal-once paired OpenClaw key provisioner and its route, atomically creating `mirror` and `knowledge_search` bindings with least-privilege scopes in `apps/web/src/server/services/api-keys.ts` and `apps/web/app/api/api-keys/openclaw/route.ts`.
- [ ] T014 Implement an internal trusted complete-Raw-snapshot revision helper and an explicit server-selected Raw slug/address input that retain verbatim Markdown, standard rendering/index/asset/replication behavior, Page current-version pointers, and immutable prior revisions in `apps/web/src/server/services/raw-entries.ts`.
- [ ] T015 Extend the Agent Memory route wrapper, public error/OpenAPI schema registry, and audit metadata rules so every new memory route is private no-store and never records Markdown, source paths, queries, excerpts, or secrets in `apps/web/app/api/v1/memory/_shared.ts`, `apps/web/src/server/api/openapi-schemas.ts`, and `apps/web/src/server/api/audit-wrapper.ts`.

**Checkpoint**: The database and server authorization model can represent one
owner-bound OpenClaw connection safely, while shared validation and Raw
snapshot primitives are ready for feature routes.

---

## Phase 3: User Story 1 - Preserve an OpenClaw Memory Wiki in next-wiki (Priority: P1) 🎯 MVP

**Goal**: Mirror one configured Memory Wiki vault into an account-bound Raw
tree while retaining exact Markdown/source provenance, revision history, and
safe recovery from transient remote failure.

**Independent Test**: Use a fixture vault with root documents and every
documented Memory Wiki directory; initial sync must create one traceable Raw
document per eligible Markdown file, a repeat scan must create no revision,
and a changed file must create exactly one new complete snapshot.

### Tests for User Story 1

- [ ] T016 [P] [US1] Add generic source-document service tests for source-path validation, server storage-path/reader-address separation, case-fold collisions, exact frontmatter/body/link retention, digest/idempotency conflicts, concurrent upserts, unchanged results, changed full snapshots, current-only indexing, and source-removal retention in `apps/web/src/server/services/agent-memory-documents.test.ts`.
- [ ] T017 [P] [US1] Add mirror connection and document-upsert route contract tests for bounds, provider-version handling, wrong-purpose denial, no-store responses, source-digest mismatch, safe errors, and immutable citations in `apps/web/app/api/v1/memory/wiki/connection/route.test.ts` and `apps/web/app/api/v1/memory/wiki/documents/route.test.ts`.
- [ ] T018 [P] [US1] Add root-confinement scanner tests for standard Memory Wiki directories, root Markdown, UTF-8/size/stability checks, symlink/traversal rejection, and `_attachments`/`.openclaw-wiki` exclusion in `packages/openclaw-memory-wiki/tests/vault-scanner.test.ts`.
- [ ] T019 [P] [US1] Add REST-client and reconciliation tests for version/header/auth behavior, serialized writes, retryable versus terminal errors, full-jitter retry, non-secret journal recovery, and no duplicate upload after restart in `packages/openclaw-memory-wiki/tests/client.test.ts` and `packages/openclaw-memory-wiki/tests/sync-service.test.ts`.
- [ ] T020 [P] [US1] Add package-runtime tests proving startup registration schedules a non-blocking initial/periodic scan beside `memory-wiki`, and that no scan can modify the local vault or active-memory behavior in `packages/openclaw-memory-wiki/tests/index.test.ts`.

### Implementation for User Story 1

- [ ] T021 [US1] Implement the generic source-document lifecycle: source-path normalization/collision detection, server-derived Page storage path and independent address, record/Page locking, immutable provenance shaping, idempotent replay, and full Raw-snapshot persistence through `agent_memory_records → pages → page_revisions` in `apps/web/src/server/services/agent-memory-documents.ts` and `apps/web/src/server/services/agent-memory.ts`.
- [ ] T022 [US1] Implement the content-free mirror-key connection capability route in `apps/web/app/api/v1/memory/wiki/connection/route.ts` using the mirror-purpose guard and Agent Memory version gate.
- [ ] T023 [US1] Implement bounded `PUT /api/v1/memory/wiki/documents` validation and created/updated/unchanged snapshot responses in `apps/web/app/api/v1/memory/wiki/documents/route.ts` using `apps/web/src/server/services/agent-memory-documents.ts`.
- [ ] T024 [US1] Add route-level OpenAPI operation metadata and mirror error/citation schemas for the two mirror endpoints in `apps/web/app/api/v1/memory/wiki/connection/route.ts`, `apps/web/app/api/v1/memory/wiki/documents/route.ts`, and `apps/web/src/server/api/openapi-schemas.ts`.
- [ ] T025 [US1] Implement strict non-secret plugin configuration, SecretRef resolution boundaries, bounded HTTP transport, safe error classification, and mirror connection probing in `packages/openclaw-memory-wiki/src/config.ts` and `packages/openclaw-memory-wiki/src/client.ts`.
- [ ] T026 [US1] Implement the stable root-confined Markdown inventory and exact SHA-256 snapshot creation in `packages/openclaw-memory-wiki/src/vault-scanner.ts`.
- [ ] T027 [US1] Implement the serialized initial/periodic reconciliation loop, atomic non-secret journal, digest-based idempotency keys, stability window, bounded full-jitter retry, degraded state, and graceful shutdown in `packages/openclaw-memory-wiki/src/sync-service.ts`.
- [ ] T028 [US1] Implement native plugin startup/shutdown registration that runs the scanner asynchronously beside `memory-wiki` without blocking conversations or compilation in `packages/openclaw-memory-wiki/src/index.ts`.
- [ ] T029 [US1] Add a real next-wiki HTTP integration scenario for initial sync, changed-file revision, idempotent restart, network recovery, and cross-namespace denial in `packages/openclaw-memory-wiki/tests/wiki-api-integration.test.ts`.
- [ ] T030 [US1] Add a Docker Compose fixture-vault smoke test that proves the mirrored Raw tree retains root files, standard directories, frontmatter, relative links, and exclusions in `packages/openclaw-memory-wiki/tests/docker-mirror.test.ts` and `docker-compose.yml`.

**Checkpoint**: An enabled plugin mirrors a complete eligible Memory Wiki tree
as account-bound immutable Raw snapshots without interfering with local
OpenClaw memory capture or compiling.

---

## Phase 4: User Story 2 - Search my complete next-wiki knowledge from OpenClaw (Priority: P1)

**Goal**: Give the bundled Skill read-only tools that search and read all
currently permitted Wiki, Raw, and Generated knowledge with citations and
safe incomplete-coverage reporting.

**Independent Test**: Seed readable Wiki, Raw, and Generated documents for one
owner plus matching data for another. The Skill must search first, read only a
chosen result, cite it, report withheld-space coverage, and never disclose the
other owner or an inaccessible result.

### Tests for User Story 2

- [ ] T031 [P] [US2] Add knowledge-facade service tests for readable-space fan-out, safe coverage, ranking/citation shaping, empty results, Raw/Generated omission, and page-read reauthorization in `apps/web/src/server/services/agent-memory-documents-search.test.ts`.
- [ ] T032 [P] [US2] Add search and selected-page route tests for query/result bounds, knowledge-key-only access, no hidden metadata, indistinguishable missing/forbidden pages, and private no-store headers in `apps/web/app/api/v1/memory/wiki/search/route.test.ts` and `apps/web/app/api/v1/memory/wiki/pages/[pageId]/route.test.ts`.
- [ ] T033 [P] [US2] Add native tool tests for bounded `next_wiki_search`/`next_wiki_get` schemas, upstream failure classification, citation forwarding, and refusal to treat a previous result as authorization in `packages/openclaw-memory-wiki/tests/tools.test.ts`.
- [ ] T034 [P] [US2] Add Skill fixture tests for search-first behavior, citation requirements, incomplete-coverage wording, proportional reads, and Markdown prompt-injection resistance in `packages/openclaw-memory-wiki/tests/next-wiki-skill.test.ts` and `packages/openclaw-memory-wiki/skills/next-wiki/SKILL.md`.

### Implementation for User Story 2

- [ ] T035 [US2] Implement the connection-bound knowledge-search and single-page-read facade that delegates to existing public-content visibility/ranking services, recomputes coverage per request, exposes source provenance only when readable, and bounds returned Markdown in `apps/web/src/server/services/agent-memory-documents.ts`.
- [ ] T036 [US2] Implement `GET /api/v1/memory/wiki/search` and `GET /api/v1/memory/wiki/pages/[pageId]` with knowledge-purpose binding guards, parameter bounds, content-free failures, and route-level OpenAPI annotations in `apps/web/app/api/v1/memory/wiki/search/route.ts` and `apps/web/app/api/v1/memory/wiki/pages/[pageId]/route.ts`.
- [ ] T037 [US2] Implement the read-only `next_wiki_search` and `next_wiki_get` TypeBox contracts, dispatch, and safe result rendering in `packages/openclaw-memory-wiki/src/tools.ts` and register them from `packages/openclaw-memory-wiki/src/index.ts`.
- [ ] T038 [US2] Write the packaged `next-wiki` Skill with configuration gating, on-demand search-first retrieval, citation/inference separation, coverage disclosure, and untrusted-content instructions in `packages/openclaw-memory-wiki/skills/next-wiki/SKILL.md`.
- [ ] T039 [US2] Add a cross-account HTTP integration journey covering all three spaces, partial grants, no-match behavior, citation reads, and modified-client isolation in `packages/openclaw-memory-wiki/tests/wiki-search-integration.test.ts`.

**Checkpoint**: The OpenClaw agent can use a dedicated Skill to ground answers
in the account's readable next-wiki knowledge without expanding the mirror
key's authority or leaking unavailable content.

---

## Phase 5: User Story 3 - Install and operate the OpenClaw plugin safely (Priority: P2)

**Goal**: Make the external plugin securely configurable, discoverable,
observable, and manually recoverable without persisting secrets in ordinary
configuration or exposing protected content in status.

**Independent Test**: In a clean supported OpenClaw state directory, provision
a paired connection, install the packed tarball, configure two SecretRefs,
inspect the runtime, run status and manual sync, and verify all outputs are
useful but contain no key, body, query, vault inventory, or raw server error.

### Tests for User Story 3

- [ ] T040 [P] [US3] Add configuration and manifest tests for HTTPS/loopback URL rules, SecretRef-only credentials, bounds/defaults, sensitive UI hints, declared-tool parity, compiled runtime entry, and redaction in `packages/openclaw-memory-wiki/tests/config.test.ts` and `packages/openclaw-memory-wiki/tests/manifest.test.ts`.
- [ ] T041 [P] [US3] Add API-key user-center and provision-route tests for the OpenClaw paired-key preset, single-reveal behavior, displayed scopes/purposes, Admin-only optional spaces, rotation, and revocation in `apps/web/src/components/user-center/ApiKeyCreateDialog.test.tsx`, `apps/web/app/api/api-keys/openclaw/route.test.ts`, and `apps/web/src/server/services/api-keys.test.ts`.
- [ ] T042 [P] [US3] Add safe operational-tool tests for `next_wiki_status`, opt-in `next_wiki_sync`, `tools.allow` gating, degraded/repair states, no-change counters, and content/secret redaction in `packages/openclaw-memory-wiki/tests/tools.test.ts` and `packages/openclaw-memory-wiki/tests/index.test.ts`.

### Implementation for User Story 3

- [ ] T043 [US3] Implement the API-key dialog preset, paired-secret reveal/copy guidance, purpose/scope explanations, and English/Chinese UI strings in `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [ ] T044 [US3] Implement the default read-only `next_wiki_status` and explicitly allowed side-effecting `next_wiki_sync` tools with safe state summaries and serialized immediate scan requests in `packages/openclaw-memory-wiki/src/tools.ts` and `packages/openclaw-memory-wiki/src/index.ts`.
- [ ] T045 [US3] Write the package's canonical install, SecretRef configuration, connection check, initial/ongoing/manual synchronization, agent-scoped-vault limitation, key rotation/revocation, and diagnosis guide in `packages/openclaw-memory-wiki/README.md`.
- [ ] T046 [US3] Add an installed-tarball host smoke test that runs `npm pack`, `openclaw plugins install npm-pack:`, runtime inspection, configuration validation, `openclaw skills list`, and safe status/manual-sync calls in `packages/openclaw-memory-wiki/tests/package-smoke.test.ts`.

**Checkpoint**: Operators can install and safely operate the package with
separate least-privilege SecretRefs, clear recovery steps, and a verified
compiled runtime rather than repository-only source files.

---

## Phase 6: User Story 4 - Discover the integration during next-wiki setup (Priority: P2)

**Goal**: Surface a collision-safe public OpenClaw guide through setup sample
pages while keeping connection data and credentials entirely private.

**Independent Test**: Initialize sample pages on a fresh Wiki, navigate from
Welcome/Main Features to `integrations/openclaw`, rerun/restore the managed
guide, and verify a user-authored page at that path remains untouched.

### Tests for User Story 4

- [ ] T047 [P] [US4] Extend managed-sample-page service tests for a fifth page, Welcome/Main Features links, refresh/no-op behavior, soft-delete restore, cache invalidation, and user-page collision protection in `apps/web/src/server/services/setup-sample-pages.test.ts`.
- [ ] T048 [P] [US4] Extend setup route and Playwright coverage for the OpenClaw guide result, navigation, localized copy, and collision reporting in `apps/web/app/api/setup/sample-pages/setup-sample-pages-route.test.ts` and `apps/web/e2e/setup-onboarding.spec.ts`.

### Implementation for User Story 4

- [ ] T049 [US4] Add the marker-owned `integrations/openclaw` sample-page source and non-secret mirror/retrieval/install/rotation/diagnosis guidance, retaining the existing Hermes guide, in `apps/web/src/server/services/setup-sample-page-definitions.ts`.
- [ ] T050 [US4] Include the OpenClaw definition in creation, refresh, restore, collision reporting, and mutation-driven cache invalidation flows in `apps/web/src/server/services/setup-sample-pages.ts`.
- [ ] T051 [US4] Update setup result labels/counts and localized help copy for the additional OpenClaw example page in `apps/web/src/components/setup/SamplePagesStep.tsx`, `apps/web/app/api/setup/sample-pages/route.ts`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [ ] T052 [US4] Link the canonical package operator guide from repository deployment/discovery documentation in `README.md`, `docs/deployment.md`, and `packages/mcp-server/README.md`.

**Checkpoint**: A fresh next-wiki installation exposes an idempotent,
non-secret OpenClaw integration guide without replacing Hermes or altering a
user-authored conflicting page.

---

## Phase 7: User Story 5 - Keep accounts and source history protected (Priority: P3)

**Goal**: Prove that every OpenClaw operation remains bound to its owner and
purpose, revocation takes effect immediately, audit data is content-free, and
local source disappearance never hard-deletes revision history.

**Independent Test**: Configure two owners and paired connections, exercise
mirror/search/read/retry/revocation with altered request fields, inspect audit
entries, and verify successful operations remain owner-bound while neither
account can enumerate or alter the other's data.

### Tests for User Story 5

- [ ] T053 [P] [US5] Add audit-redaction tests proving OpenClaw route operations retain only endpoint/status/key/correlation timing while excluding secrets, Markdown, source paths/digests, titles, queries, excerpts, and response bodies in `apps/web/src/server/services/audit.test.ts` and `apps/web/src/server/api/audit-wrapper.test.ts`.
- [ ] T054 [P] [US5] Add route/service isolation and revocation tests for modified namespace/path/space inputs, purpose swapping, expired/revoked/disabled keys, cross-owner page IDs, and retained source documents in `apps/web/src/server/services/agent-memory-documents.test.ts`, `apps/web/app/api/v1/memory/wiki/documents/route.test.ts`, `apps/web/app/api/v1/memory/wiki/search/route.test.ts`, and `apps/web/app/api/v1/memory/wiki/pages/[pageId]/route.test.ts`.
- [ ] T055 [P] [US5] Add user-center and real-plugin end-to-end coverage for paired-key creation, access reduction, revocation, recovery messaging, audit visibility, and cross-account rejection in `apps/web/e2e/api-keys.spec.ts` and `packages/openclaw-memory-wiki/tests/wiki-api-integration.test.ts`.

### Implementation for User Story 5

- [ ] T056 [US5] Harden paired-key validation and revocation/rotation propagation so a disabled owner, namespace, or key immediately prevents its corresponding mirror/search operation without deleting Raw pages or revisions in `apps/web/src/server/services/api-keys.ts`, `apps/web/src/server/permissions/agent-memory.ts`, and `apps/web/src/server/services/agent-memory-documents.ts`.
- [ ] T057 [US5] Enforce operation-level audit redaction and safe correlation/error mapping for all `/api/v1/memory/wiki/*` routes in `apps/web/src/server/api/audit-wrapper.ts`, `apps/web/src/server/services/audit.ts`, and `apps/web/app/api/v1/memory/_shared.ts`.
- [ ] T058 [US5] Add plugin-side safe repair guidance for unauthorized, revoked, incompatible, unavailable, conflict, and missing-result outcomes without caching protected bodies or treating a failed write/read as successful in `packages/openclaw-memory-wiki/src/client.ts`, `packages/openclaw-memory-wiki/src/sync-service.ts`, and `packages/openclaw-memory-wiki/src/tools.ts`.

**Checkpoint**: The integration preserves owner isolation and immutable source
history while making revocation and safe audit evidence operationally visible.

---

## Phase 8: Polish & Cross-Cutting Validation

**Purpose**: Verify migration discipline, generated API documentation,
packaging, compatibility, documented workflows, and end-to-end behavior across
the completed feature.

- [ ] T059 [P] Regenerate and verify public OpenAPI after all route/schema changes with `pnpm --filter @next-wiki/web openapi:generate`, committing `apps/web/public/openapi.json` and validating it in `apps/web/src/server/api/openapi-schemas.test.ts`.
- [ ] T060 [P] Re-run `pnpm db:generate` from `apps/web/src/server/db/schema/agent-memory.ts`, confirm no pending changes, and verify the generated migration/snapshot remains the sole schema history update in `apps/web/src/server/db/migrations/`.
- [ ] T061 [P] Add minimum-supported/current-stable/latest-beta OpenClaw compatibility and manifest/config/runtime inspection coverage to `packages/openclaw-memory-wiki/tests/openclaw-compatibility.test.ts` and `.github/workflows/publish-openclaw-memory-wiki.yml`.
- [ ] T062 [P] Review server/package/UI/sample-page output for credential, protected-content, raw-error, and prompt-injection leakage in `apps/web/src/server/services/agent-memory-documents.ts`, `packages/openclaw-memory-wiki/src/client.ts`, `packages/openclaw-memory-wiki/skills/next-wiki/SKILL.md`, and `apps/web/src/server/services/setup-sample-page-definitions.ts`.
- [ ] T063 Run focused shared, service, route, plugin, and setup tests named by `packages/shared/src/agent-memory.test.ts`, `apps/web/src/server/services/agent-memory-documents.test.ts`, `apps/web/app/api/v1/memory/wiki/documents/route.test.ts`, `packages/openclaw-memory-wiki/tests/`, and `apps/web/e2e/setup-onboarding.spec.ts`; fix only feature-related failures.
- [ ] T064 Run workspace/package typecheck, lint, test, and production builds using `package.json`, `apps/web/package.json`, and `packages/openclaw-memory-wiki/package.json`.
- [ ] T065 Run the Docker Compose full journey from `specs/040-openclaw-memory-wiki/quickstart.md` using `docker-compose.yml`, including paired-key provisioning, fixture-vault mirror/retry, all-space retrieval, partial coverage, account isolation, and tarball installation smoke validation.
- [ ] T066 Reconcile and validate all documented commands, limits, deployment-address guidance, controlled ClawHub publication wording, and no-secret examples against `specs/040-openclaw-memory-wiki/quickstart.md`, `packages/openclaw-memory-wiki/README.md`, `docs/deployment.md`, and `apps/web/src/server/services/setup-sample-page-definitions.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001–T004 can proceed in parallel.
- **Foundational (Phase 2)**: Depends on Setup where package artifacts are
  needed; T005–T015 block feature routes and runtime integration.
- **US1 (Phase 3)**: Depends on the complete Foundation and is the first
  independently useful mirror MVP.
- **US2 (Phase 4)**: Depends on Foundation and the paired connection boundary;
  its read-only retrieval work can proceed after those contracts stabilize and
  is independently testable with seeded pages.
- **US3 (Phase 5)**: Depends on US1's package/client lifecycle because safe
  status and manual sync exercise the real mirror runtime.
- **US4 (Phase 6)**: Depends on Foundation for sample-page behavior and should
  validate after US3 so published instructions match the shipped workflow.
- **US5 (Phase 7)**: Depends on US1/US2/US3 endpoints to verify their
  isolation, revocation, and audit behavior.
- **Polish (Phase 8)**: Depends on every desired user story.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundation; delivers account-bound, immutable
  Memory Wiki mirroring.
- **US2 (P1)**: Starts after Foundation; consumes paired credentials but does
  not depend on a completed vault import to search independent Wiki/Raw/
  Generated data.
- **US3 (P2)**: Builds on US1's plugin runtime to make installation and
  operation safe and inspectable.
- **US4 (P2)**: Uses the completed configuration/operation workflow but does
  not depend on account-wide search implementation details.
- **US5 (P3)**: Validates the security properties of the routes and plugin
  behavior delivered by US1–US3.

### Within Each User Story

- Write the listed tests first and confirm the missing behavior fails.
- Complete shared/schema/permission work before services; services before
  routes; routes before plugin dispatch and end-to-end validation.
- Keep Markdown canonical only in Raw revisions; the common Agent Memory
  record, Page storage path, journal, and audit state must not store bodies,
  queries, excerpts, or secrets.
- At each checkpoint run the stated independent scenario before accepting the
  next story.

### Parallel Opportunities

- T001–T004 and T005–T008 can proceed in parallel.
- After Foundation, US1 mirror implementation and US2 read facade/tests can
  be assigned separately if changes to `apps/web/src/server/services/agent-memory-documents.ts`
  are coordinated.
- US4 sample-page work touches separate files and can run in parallel with the
  plugin operation work after its guide content is agreed.
- T059–T062 can run in parallel before the final command suites.

## Parallel Example: User Story 1

```text
Task: "T016 service snapshot/provenance tests in apps/web/src/server/services/agent-memory-documents.test.ts"
Task: "T017 mirror route tests in apps/web/app/api/v1/memory/wiki/documents/route.test.ts"
Task: "T018 vault scanner tests in packages/openclaw-memory-wiki/tests/vault-scanner.test.ts"
Task: "T019 client/reconciliation tests in packages/openclaw-memory-wiki/tests/sync-service.test.ts"
```

After those tests exist, T021 (server mirror service) and T026 (vault scanner)
can proceed in parallel. T022–T024 follow T021, while T027–T028 follow T025
and T026.

## Implementation Strategy

### Recommended MVP (US1 + US2)

1. Complete Setup and the security-critical Foundation.
2. Complete US1 and prove initial import, no-op reconciliation, changed-file
   history, and recovery against a fixture vault.
3. Complete US2 and prove cited, permission-filtered account-wide retrieval.
4. Stop and validate this mirror plus retrieval journey before adding
   operator UX, onboarding, or publication automation.

US1 alone protects the captured knowledge; US1 plus US2 is the smallest
externally useful result requested by the feature specification.

### Incremental Delivery

1. Setup + Foundation → paired credentials and an enforceable server boundary.
2. US1 → durable Memory Wiki preservation.
3. US2 → cited account-wide knowledge retrieval.
4. US3 → secure install, status, and manual recovery.
5. US4 → setup discoverability and canonical documentation.
6. US5 → operational isolation and audit confidence, then full release checks.

### Parallel Team Strategy

1. One developer completes Foundation schema, permissions, paired keys, and
   Raw snapshot primitives.
2. Once those contracts stabilize:
   - Developer A: US1 mirror routes and plugin reconciliation.
   - Developer B: US2 search/read facade, tools, and Skill.
   - Developer C: US4 managed sample page and documentation preparation.
3. Integrate US3 operation controls, then US5 security verification and Phase
   8 release validation together.

## Notes

- `[P]` tasks touch distinct files and may be performed in parallel.
- `[US#]` labels retain traceability to the corresponding specification story.
- Do not hand-author Drizzle migration files; T011 and T060 must use
  `pnpm db:generate`.
- Do not put a literal secret in configuration, fixtures, documentation, Skill
  text, audit metadata, logs, or test snapshots.
- Commit each coherent completed task group; keep refactors separate from this
  feature behavior.
