# Implementation Plan: OpenClaw Agent Memory Bridge

**Branch**: `openclaw-memory-simple` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/040-openclaw-memory-integration/spec.md`

## Summary

Add OpenClaw as a second adapter to the existing 039 Agent Memory service.
The server's generic `/api/v1/memory` contract, schema, and permission
resolver are unchanged — Hermes already proved they're client-neutral. The
only new artifact is `@next-wiki/openclaw-memory-bridge`: a separately
published, hook-only OpenClaw plugin with a restart-safe local outbox for
non-blocking evidence capture, optional static tools, and optional prompt
enrichment.

No database migration, no new routes, no new shared Zod schemas, and no
OpenAPI changes are part of this feature — everything the bridge calls
already exists and is already documented.

## Technical Context

**Language/Version**: Node 22.22.3+ for the independently packaged OpenClaw ESM plugin; no change to the existing web app's TypeScript/Node versions.
**Primary Dependencies**: the documented OpenClaw plugin SDK (`openclaw`), TypeBox for tool parameter schemas. No new dependency in `apps/web`.
**Storage**: none added. Canonical content continues through the existing restricted Wiki pages/revisions the 039 service already writes to.
**Testing**: Vitest unit tests for the bridge package (config parsing, outbox, capture lifecycle, API client, tools/prompt enrichment), a real `npm pack` → clean install → runtime-inspection gate before publish.
**Target Platform**: a separately installed OpenClaw Gateway plugin. The Next Wiki server itself is untouched.
**Project Type**: adds one package to the existing monorepo; no change to the web app's structure.
**Performance Goals**: hooks persist a local outbox entry within the 200 ms local delivery budget (spec.md Bounded Limits) without conversation-path network waits.
**Constraints**: existing `/api/v1/memory` remains the only agent API base; no schema/migration/route changes; local outbox capped at 500 entries/256 KB each with a 7-day TTL and exponential backoff (5s–10min).
**Scale/Scope**: one new package (`packages/openclaw-memory-bridge`) plus one new managed guide page. Everything else is reuse.

## Constitution Check

| Principle | Design response | Status |
|---|---|---|
| Minimal, focused changes | No schema/route/schema-package changes. The entire feature is one new adapter package plus one guide page. | Pass |
| Domain-first authorization | Unchanged: the existing per-key destination resolution is the only authorization concept, reused as-is. | Pass |
| Canonical provenance | Unchanged: memory text remains a restricted Raw revision, written by the existing 039 service. | Pass |
| Compatibility | Hermes is completely untouched; OpenClaw is added as an independent, optional adapter package. | Pass |
| Safe asynchronous work | Capture is idempotent and non-blocking, with a restart-safe local outbox in the bridge package. | Pass |
| Database discipline | N/A this feature — no schema change, no migration. | Pass |
| API documentation | N/A this feature — no route or schema change to document. | Pass |
| Public docs/cache discipline | One new OpenClaw guide page, added via the existing marker-owned, collision-safe sample-page mechanism (no cache-tag changes needed — reuses the same invalidation path as every other guide). | Pass |

## Project Structure

```text
apps/web/
└── src/server/services/setup-sample-page-definitions.ts   # adds the OpenClaw guide page (only web-app change)
packages/
├── hermes-memory-provider/                # unchanged
└── openclaw-memory-bridge/                # new: manifest, config, hooks, outbox, service, api-client, tools, prompt-enrichment
.github/workflows/
└── publish-openclaw-memory-bridge.yml     # new: build/test/manifest-validate/pack/clean-install/publish gate
specs/040-openclaw-memory-integration/
├── data-model.md      # "no schema changes" note
├── quickstart.md
└── tasks.md
```

## Design and Delivery Order

### 1. Build the bridge package

Ship OpenClaw as a separately published ESM `definePluginEntry` non-capability
plugin: no exclusive memory slot, no server-side OpenClaw dependency, and no
call to another plugin's internals. A registered service owns a portable,
restart-safe local outbox (capped entries/size/TTL, exponential retry
backoff). Observation hooks enqueue only; they never block
conversation/compaction awaiting the API or promise a pre-compaction remote
save. The API client calls the existing, unchanged `/api/v1/memory/{records,
recall,evidence,connection,diagnostics}` endpoints — the same ones Hermes
uses.

Optional static tools (`agent_memory_search/save/forget/status`) and optional
second-phase prompt enrichment are operator opt-in, both disabled by default.
The bridge sends only the generic v1 contract and renders bounded, escaped
citations; it never fabricates a scope or sharing concept the server doesn't
have.

### 2. Add one guide page

Add an OpenClaw bridge guide using the same marker-owned, collision-safe
sample-page mechanism the existing Hermes guide already uses — no new cache
tags or invalidation logic needed, since it reuses the exact same code path.

### 3. Release verification

Validate the manifest, pack the package, clean-install it into a scratch
project alongside the real `openclaw` peer dependency, and dynamically import
the built entry point before ever publishing — catches ESM packaging defects
(e.g. missing `.js` extensions on relative imports) that only surface outside
the monorepo's own `node_modules`.

## Complexity Tracking

No constitution exceptions are required, and none of the previous
complexity-tracking entries (extra tables, a v2 route family) apply: this
feature adds no schema and no new route.
