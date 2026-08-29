# Tasks: OpenClaw Agent Memory Bridge

**Input**: Design documents from `/specs/040-openclaw-memory-integration/`
**Prerequisites**: `plan.md`, `spec.md`, `data-model.md`, `quickstart.md`

**Scope**: This feature adds one new package and one new guide page. It makes
no server schema, route, or shared-schema change — everything the bridge
calls (`/api/v1/memory/*`) already exists and is already documented.

## Phase 1: Bridge package setup

- [X] T001 Create the OpenClaw bridge package workspace, ESM build settings, package exports, peer dependency, and test scripts in `packages/openclaw-memory-bridge/package.json`, `packages/openclaw-memory-bridge/tsconfig.json`, `vitest.config.ts`
- [X] T002 [P] Implement strict config parsing (`wikiApiBaseUrl`, `credential`, `capture`, `tools`, `promptEnrichment`, all disabled by default) in `packages/openclaw-memory-bridge/src/config.ts`, with tests in `tests/config.test.ts`
- [X] T003 [P] Implement the secret-safe v1 HTTP client (connection/diagnostics/recall/save/forget/submitEvidence/captureStatus) in `packages/openclaw-memory-bridge/src/api-client.ts`, with tests in `tests/api-client.test.ts`
- [X] T004 [P] Implement credential/payload redaction helpers in `packages/openclaw-memory-bridge/src/redaction.ts`

## Phase 2: Non-blocking capture (User Story 2 — the actual new capability)

**Goal**: OpenClaw preserves enabled lifecycle evidence with a bounded,
restart-safe local outbox without blocking a turn or claiming premature
durability.

**Independent Test**: Take the API offline, trigger an enabled lifecycle
event, restart Gateway/API, and verify exactly one cited durable capture.

- [X] T005 Implement the portable local outbox bounded to spec.md's Bounded Limits (500 entries/256 KB per key, 7-day TTL, 5s–10min exponential backoff) in `packages/openclaw-memory-bridge/src/outbox.ts`, with tests in `tests/outbox.test.ts`
- [X] T006 Implement deterministic capture-event construction (session digest, capture kind, message normalization) in `packages/openclaw-memory-bridge/src/capture.ts`
- [X] T007 Implement the registered delivery service (start/recovery/stop, non-blocking `start()`, no-payload logging) in `packages/openclaw-memory-bridge/src/service.ts`
- [X] T008 Register opt-in `before_compaction`, `after_compaction`, `agent_end`, `session_end`, gateway-start, and shutdown hooks that only enqueue/reconcile state, in `packages/openclaw-memory-bridge/src/hooks.ts`, with tests in `tests/capture-lifecycle.test.ts` (duplicate/retry produces at most one durable record per SC-002; safe skip when required fields are missing; `stop()` resolves within its drain budget even if a delivery never settles)
- [X] T009 Wire config parsing, the API client, and the service/hooks lifecycle into the plugin entry point (`definePluginEntry`, no `registerMemoryCapability` call — confirmed non-capability) in `packages/openclaw-memory-bridge/src/index.ts`, with tests in `tests/index.test.ts`

**Checkpoint**: an OpenClaw completed turn never blocks on Wiki availability;
a duplicated/restarted capture produces at most one durable record.

## Phase 3: Optional tools and prompt enrichment

- [X] T010 [P] Implement the four optional static tools (`agent_memory_search/save/forget/status`), disabled by default, with escaped citations, in `packages/openclaw-memory-bridge/src/tools.ts`
- [X] T011 [P] Implement optional second-phase prompt enrichment via `agent_turn_prepare` (bounded, escaped, cited; safe-skips on missing session correlation or a client error), disabled by default, in `packages/openclaw-memory-bridge/src/prompt-enrichment.ts`
- [X] T012 [P] Add tool/prompt-enrichment tests (registration gating, citation escaping, safe error handling) in `packages/openclaw-memory-bridge/tests/tools-and-prompt.test.ts`
- [X] T013 Add the plugin manifest (`openclaw.plugin.json`) declaring the four tool contracts and the `capture`/`tools`/`promptEnrichment` config schema

## Phase 4: Guide page (User Story 1 — same service, documented for OpenClaw)

- [X] T014 Add the OpenClaw Bridge Guide as a managed sample/help page, using the existing marker-owned, collision-safe sample-page mechanism (same one the Hermes guide already uses — no new cache-tag or invalidation logic needed) in `apps/web/src/server/services/setup-sample-page-definitions.ts` and `setup-sample-pages.ts`
- [X] T015 Update `setup-sample-pages.test.ts` for the fifth managed page (count, path, content assertions, cache-invalidation count)

## Phase 5: Release verification

- [X] T016 Add manifest-validation, `npm pack`, clean-install, and runtime-inspection scripts in `packages/openclaw-memory-bridge/scripts/validate-manifest.mjs` and `scripts/inspect-runtime.mjs`
- [X] T017 Add the publish workflow (build/typecheck/test/manifest-validate/pack/clean-install/runtime-inspect/publish) in `.github/workflows/publish-openclaw-memory-bridge.yml`
- [X] T018 Update `packages/openclaw-memory-bridge/README.md` and `packages/hermes-memory-provider/README.md` for the current (already-existing) key-creation/shared-destination flow
- [X] T019 Ran the focused bridge test suite (47 tests), full-workspace `pnpm typecheck` (5/5 packages) and `pnpm --filter @next-wiki/web lint`, a real pack+clean-install+runtime-inspection dry run, and the web-app guide-page/agent-memory/api-keys test files (agent-memory.test.ts, api-keys.test.ts, permissions/agent-memory.test.ts, jobs/agent-memory-capture.test.ts, db/agent-memory-schema.test.ts, setup-sample-pages.test.ts) — all green. Recorded outcomes in `quickstart.md` per section.
- [X] T020 Added `apps/web/e2e/agent-memory-openclaw-hermes.spec.ts` — a real Playwright run against a dedicated Postgres + built server proving two independent memory-provider keys stay isolated by default, and that sharing a destination alone does **not** unify recall (a real, previously-undocumented nuance this test caught and the guides were corrected for): recall stays isolated per `(destination, agent identity)`, so a shared-destination key with a different identity still can't see the other key's content, and only matching *both* destination and identity unifies recall.

## Not doing (see spec.md "Not building yet")

- No connection entity separate from the API key, no destination-grant table,
  no promotion service, no "Deliberate sharing" UI — the existing
  shared-destination option on key creation already covers the real need.
- No local-memory import utility (`packages/openclaw-memory-migrate`) — no
  adopter needs it yet.
- No schema migration, no new `/api/v1/memory/*` route, no OpenAPI change —
  nothing this feature does requires any of them.

## Implementation Strategy

1. Bridge package (Phases 1–3) — done, 47 tests passing, typecheck/lint clean.
2. One guide page (Phase 4) — done.
3. Release verification (Phase 5) — manifest/pack/clean-install/CI done;
   final full-suite run and a real e2e coexistence test remain (T019–T020).
