# Implementation Plan: Content Import and Export

**Branch**: `005-content-import-export` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-content-import-export/spec.md`

## Summary

Add an administrator-only migration center that exports the current published
wiki as a versioned, integrity-checked ZIP containing standard Markdown,
frontmatter, a manifest, and referenced images; previews and imports that archive
with explicit conflict handling; and imports all accessible Wiki.js pages through
its GraphQL API while localizing referenced images.

All expensive work runs as resumable pg-boss jobs. Transfer metadata, progress,
item outcomes, encrypted source credentials, and mappings live in PostgreSQL.
Large uploaded/generated artifacts are streamed to an opaque local artifact
directory on the existing content volume rather than stored as database blobs.
Archive parsing is streaming and rejects unsafe paths, oversized expansion, and
undeclared entries before content mutation. Imports write through the existing
page revision, rendering, asset validation, content-store replication, Git
export, and AI-index reconciliation paths.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Docker uses Node 24), React 19.2, Next.js 16
**Primary Dependencies**: Existing Next.js/Drizzle/pg-boss/Zod/unified stack; add `yazl` for streaming ZIP creation, `yauzl` for lazy validated ZIP reads, `yaml` for frontmatter, `turndown` for supported Wiki.js HTML conversion, and `ipaddr.js` for normalized network-range checks
**Storage**: PostgreSQL 16 for transfer metadata and state; existing content stores for Markdown/images; local persistent artifact directory under `/data/content/transfers` for ZIP uploads, exports, and reports
**Testing**: Vitest integration/unit tests, HTTP fixture servers, malicious ZIP fixtures, Playwright admin flows, Docker Compose smoke tests
**Target Platform**: Self-hosted Linux containers via Docker Compose and Kubernetes-compatible shared persistent volume
**Project Type**: Full-stack web application with REST APIs and background workers
**Performance Goals**: Stream all archives and remote assets with bounded memory; complete representative 1,000-page/5,000-image/2-GB export or import within 30 minutes; update visible progress at least every 5 seconds or 100 items
**Constraints**: Admin-only; no new stateful service; no plaintext credentials; maximum compressed/expanded bytes, entry count, per-entry size, redirect count, and remote response time; one active content-mutating transfer; import item writes atomic and retryable
**Scale/Scope**: Current published state of the default space; up to 50,000 archive entries and configurable 2-GB compressed/4-GB expanded defaults; portable archive v1 plus Wiki.js 2.2+ source adapter

## Constitution Check

*GATE: Passed before Phase 0 and re-checked after Phase 1.*

| Gate | Plan compliance |
|------|-----------------|
| P1 Simple deployment | Uses PostgreSQL, the existing application/worker image, and the already-mounted content volume. No Redis, object store, or additional service is required. |
| P3 Rendering pipeline | Imported source is rendered through the existing registered Markdown pipeline; no component stores or trusts imported rendered HTML. |
| P4 Permissions | Every route/service requires `manage` permission for transfer resources. Jobs carry the initiating admin actor. Artifact downloads and source configuration never bypass permission checks. |
| P5 UI consistency | Admin surfaces use existing layout, settings tabs, data tables, dialogs, inputs, status badges, and design tokens. |
| P6 Async-first | Export, validation/preview, Wiki.js discovery, import, retry, report generation, and cleanup run through explicitly registered pg-boss queues. Upload streaming is the only request-bound byte transfer. |
| P7 Version everything | New pages create revision 1; replacement imports append and publish a new immutable revision. Prior revisions are preserved. |
| P8 Open standards | ZIP contains Markdown + YAML frontmatter and a JSON manifest. Public routes are REST + JSON/OpenAPI; artifact content uses standard ZIP/JSON/Markdown. |
| P9 Explicit registration | Transfer source adapters, job handlers, artifact store, archive codec, and content converters use bounded explicit registries. No filesystem scanning or dynamic provider loading. |
| P10 Native navigation | Canonical entry point is `/admin/transfers`; selected tab, run filters, page, and selected run are URL-backed. Member runs are deep-linkable at `/admin/transfers/{id}`. |
| Page/path mandate | Import identity and conflicts use `(space_id, path, locale)`. Paths are normalized and validated before preview and again before write. |
| Content-store mandate | Page/asset writes use existing services and content-store replication. Transfer artifacts are operational files, not authoritative wiki content. |
| Operations mandate | Jobs are durable/recoverable, expose status, produce structured logs/reports, and include retention cleanup. |

No constitutional violations require a complexity exception.

## Project Structure

### Documentation (this feature)

```text
specs/005-content-import-export/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── archive-v1.md
│   ├── rest-api.md
│   └── wikijs-graphql.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/shared/src/
└── transfers.ts                         # enums, Zod request/response/manifest schemas

apps/web/
├── app/
│   ├── (admin)/admin/transfers/
│   │   ├── page.tsx                    # canonical collection/tabs
│   │   └── [id]/page.tsx               # deep-linkable run detail
│   └── api/
│       ├── transfer-sources/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── transfer-artifacts/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── content/route.ts
│       └── transfers/
│           ├── route.ts
│           └── [id]/
│               ├── route.ts
│               ├── items/route.ts
│               ├── cancellation/route.ts
│               └── retries/route.ts
├── src/
│   ├── components/admin/transfers/
│   │   ├── TransferAdminTabs.tsx
│   │   ├── ExportPanel.tsx
│   │   ├── ArchiveImportPanel.tsx
│   │   ├── WikiJsSourcePanel.tsx
│   │   ├── TransferRunList.tsx
│   │   ├── TransferRunDetail.tsx
│   │   └── TransferPreview.tsx
│   └── server/
│       ├── db/
│       │   ├── schema/index.ts
│       │   └── migrations/0016_content_transfers.sql
│       ├── transfers/
│       │   ├── registry.ts             # explicit source/converter registry
│       │   ├── artifact-store.ts       # opaque local artifact paths + atomic finalize
│       │   ├── archive-reader.ts       # lazy entry validation/read
│       │   ├── archive-writer.ts       # streaming ZIP generation
│       │   ├── manifest.ts
│       │   ├── markdown-links.ts       # AST-based page/asset reference rewrite
│       │   ├── remote-fetch.ts         # SSRF-safe bounded HTTP
│       │   ├── wikijs-client.ts
│       │   └── converters/
│       │       ├── markdown.ts
│       │       └── html.ts
│       ├── services/
│       │   ├── transfers.ts
│       │   ├── transfer-sources.ts
│       │   └── transfer-artifacts.ts
│       └── jobs/
│           ├── transfer-export.ts
│           ├── transfer-preview.ts
│           ├── transfer-import.ts
│           ├── transfer-cleanup.ts
│           ├── register.ts
│           └── runtime.ts
└── test/
    ├── transfer-fixtures.ts
    └── wikijs-fixture.ts
```

**Structure Decision**: Keep the existing monorepo and full-stack Next.js
application. Shared wire schemas belong in `packages/shared`; route shells remain
thin; migration business logic is isolated under server services/transfers/jobs;
all controls compose existing UI primitives.

## Phase 0: Research Outcomes

Research decisions are recorded in [research.md](./research.md). They resolve:

1. streaming ZIP libraries and archive v1 layout;
2. safe upload/artifact persistence without a new service;
3. preview, idempotency, replacement revision, and retry semantics;
4. Wiki.js page and asset discovery contracts;
5. supported content conversion;
6. SSRF, redirect, DNS, and remote image rules;
7. job concurrency/recovery and retention;
8. URL-backed admin UX and API resource layout.

No `NEEDS CLARIFICATION` items remain.

## Phase 1: Design Outcomes

- [data-model.md](./data-model.md) defines source, run, item, artifact, and
  source-to-target mapping records plus lifecycle transitions.
- [contracts/archive-v1.md](./contracts/archive-v1.md) defines the portable ZIP
  layout, manifest, frontmatter, checksum, and compatibility rules.
- [contracts/rest-api.md](./contracts/rest-api.md) defines the admin REST
  resources, status codes, upload streaming contract, pagination, and errors.
- [contracts/wikijs-graphql.md](./contracts/wikijs-graphql.md) defines required
  Wiki.js queries, permissions, content conversion, and asset URL derivation.
- [quickstart.md](./quickstart.md) defines implementation verification,
  malicious-input drills, Docker validation, and end-to-end migration checks.

### Post-design Constitution Re-check

The Phase 1 design still passes every gate. The artifact directory is a
persistent operational workspace on the existing volume, not a new
authoritative content backend. The worker remains pg-boss/PostgreSQL-backed.
Archive and remote-source modules are explicitly registered, and imported page
mutations reuse versioned service-layer writes.

## Phase 2: Implementation Planning Boundary

`/speckit.tasks` will break implementation into:

1. schemas/migration/artifact store and safety limits;
2. archive v1 writer and export jobs;
3. upload, archive validation, preview, and import;
4. Wiki.js adapter, converters, and remote image localization;
5. admin routes/UI with URL-backed state;
6. cancellation, retry, retention cleanup, auditing, OpenAPI, and test hardening.

## Complexity Tracking

No constitution violations.
