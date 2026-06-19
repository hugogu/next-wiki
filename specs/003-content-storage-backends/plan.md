# Implementation Plan: Pluggable Content Storage & In-Editor Images

**Branch**: `003-content-storage-backends` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-content-storage-backends/spec.md`

## Summary

Decouple raw page content (Markdown source + referenced images) from the database
behind a single pluggable **ContentStore** interface, and let an administrator
choose where that content lives — **Database** (default), **Local filesystem**,
**S3-compatible object storage** — plus an optional one-way **Git export** target
for publishing standard Markdown (e.g. to GitHub Pages). Add **in-editor image
support** (upload + paste) on top of the store. Provide **safe automatic
migration** (copy → verify → cutover, brief read-only window) when an admin
switches the active backend, run as a background job. Extend the API-key
permission model with two new scopes — `storage` (存储控制) and `preferences`
(偏好管理).

This slice builds on the 001/002 foundation: same Drizzle/PostgreSQL stack, same
`can()` chokepoint and scope-intersection model, same unified design system, same
i18n framework, same REST + Zod pattern. It introduces the project's first
**pg-boss** usage (mandated by P6) for migration and Git export — running inside
PostgreSQL with an in-process worker, so the default deployment stays a single
web container + PostgreSQL. S3 and Git libraries are loaded only when those
optional backends are configured.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor).
**Primary Dependencies (inherited)**: Next.js 16 (App Router, RSC) + React 19.2;
Drizzle ORM (PostgreSQL 16+); unified/remark/rehype Markdown pipeline; CodeMirror
6 editor; Tailwind + CSS custom properties; TanStack Query; Zustand; Zod; custom
i18n (`apps/web/src/i18n/`, `en.ts` canonical + `zh.ts`). Reuses the 002
AES-256-GCM `encryptKey`/`decryptKey` + `API_KEY_ENCRYPTION_KEY`.
**New Dependencies (this slice)**: `pg-boss` (job queue inside PostgreSQL, for
migration + Git export — P6); `@aws-sdk/client-s3` (S3 backend, optional);
`isomorphic-git` (Git export, optional, pure-JS, no system git).
**Storage**: PostgreSQL 16+ (new tables: `storage_backends`, `content_assets`,
`content_asset_refs`, `content_blobs`, `content_migrations`; `page_revisions`
column change: `content_source` becomes nullable; `api_key_scope` enum gains
`storage`, `preferences`). Plus the selected external backend (filesystem / S3 /
Git) when not Database.
**Testing**: Vitest (unit/integration) + Playwright (E2E).
**Target Platform**: Linux server (Docker Compose), single instance.
**Project Type**: Web application (Next.js monorepo, `apps/web` + `packages/*`).
**Performance Goals**: Image insert renders in preview within a few seconds
(SC-001); migration runs without UI blocking and without read downtime (SC-005).
**Constraints**: Default deployment MUST stay PostgreSQL-only with content in the
database (P1, SC-002); no new required env var or service; no SPA; all new UI
bilingual.
**Scale/Scope**: Personal / small-team wiki; single active authoritative backend;
one migration at a time.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Source: `.specify/memory/constitution.md` v1.4.0.

| Principle / Mandate | Status | How this slice satisfies it |
|---|---|---|
| P1 Simple Deployment | PASS | Default backend = Database; PostgreSQL stays the only required stateful service. pg-boss runs **inside** PostgreSQL (no Redis/queue service). S3/Git/Local are explicit opt-in; their libraries load only when configured. No new **required** env var (backend secrets reuse `API_KEY_ENCRYPTION_KEY`). Worker runs in-process → still one container. New default npm dep `pg-boss` justified below (Complexity Tracking). |
| P2 AI Optional Enhancement | PASS (N/A) | No AI surface in this slice. |
| P3 Rendering Pipeline is Sacred | PASS | Storage is decoupled from rendering. `renderMarkdown` is unchanged; `content_html` stays derived in the DB. The ContentStore never touches the render pipeline; images are referenced, not embedded into the pipeline. |
| P4 Permissions are First-Class | PASS | New `manage_storage` / `manage_preferences` actions flow through `can()`. Image reads (`/api/assets/{id}`) enforce the owning page's `read` permission. New scopes use scope ∩ role (FR-024). No route bypasses `can()`. |
| P5 Style System & UI Consistency | PASS | Editor image controls, admin storage settings, migration status all use `src/components/ui/` primitives and tokens. No bespoke styling. |
| P6 Async-First for Heavy Operations | PASS | Migration (whole-corpus copy) and Git export (`git push`) run as pg-boss jobs returning a job id; UI reflects status asynchronously. Single image upload (<500ms, no resizing) stays synchronous. |
| P7 Version Everything | PASS | Revisions remain immutable; `content_hash` (fingerprint) stays in the DB. Only raw bytes relocate. Image lifecycle is reference-aware and soft (no hard delete on edit). Revision model unchanged → "support future Git sync without schema change" already honored. |
| P8 Open Standards Over Proprietary | PASS | Exported content on Local/S3/Git is standard Markdown + frontmatter + standard image files (FR-029). S3 uses the standard S3 API (vendor-neutral, MinIO-compatible). Git export is a standard repo. |
| P9 Explicit Over Implicit | PASS | Backends registered in one bounded registry (`content-store/registry.ts`) with a typed contract — no filesystem/dynamic discovery. pg-boss jobs registered explicitly at boot. The active backend is an explicit DB row. |
| P10 Native Web Navigation & Unified Entry Points | PASS | Admin storage at one canonical URL `/admin/storage`; migration status is a sub-resource of it. Image asset URLs are real GET resources. Browser back/forward/refresh/deep-link work. No verb URLs. |
| Mandate: Rendering Pipeline | PASS | `source → parse → transform[] → render` untouched; transformers never touch the DB or the store. |
| Mandate: Permission Model | PASS | Three axes preserved; new actions added to the same evaluation, no admin bypass. |
| Mandate: Content Versioning | PASS | Every mutation still creates an immutable revision; diffs computed from source (now via the store). Revisions never deleted by normal ops. |
| Mandate: Editor Extensibility | PASS | Editor still serializes to raw Markdown only; the client AST never leaves the browser; only an image-reference string is inserted. |
| Mandate: Git Storage Sync | PASS | Git is optional, async (pg-boss), one-way; DB stays source of truth. Two-way sync remains blocked (out of scope). |
| Mandate: Deployment & Ops Baseline | PASS | Single `docker compose up`; PostgreSQL + named volumes. Local backend adds a documented volume mount only when selected. Migrations auto-apply. Job status observable. |
| Mandate: Frontend Routing & URL | PASS | RESTful resource URLs; breadcrumbs derived from route; one canonical entry point for storage admin. |
| Mandate: Frontend Data Flow | PASS | Server data via RSC + TanStack Query; migration status polled via TanStack Query; no server/UI state mixing. |

No gate failures. Justified new dependencies are tracked in Complexity Tracking.

## Design Decisions

### D1 — ContentStore interface & registry

A single server-only module `src/server/content-store/` exposes:

```ts
export interface ContentStore {
  readonly type: StorageBackendType; // 'database' | 'local' | 's3'
  putMarkdown(revisionId: string, source: string): Promise<void>;
  getMarkdown(revisionId: string): Promise<string>;
  putImage(assetId: string, bytes: Buffer, contentType: string): Promise<void>;
  getImage(assetId: string): Promise<{ bytes: Buffer; contentType: string }>;
  deleteImage(assetId: string): Promise<void>;
  listMarkdownKeys(): AsyncIterable<string>;   // revisionIds
  listImageKeys(): AsyncIterable<string>;      // assetIds
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
```

Implementations: `DatabaseStore` (markdown ↔ `page_revisions.content_source`,
images ↔ `content_blobs`), `LocalStore` (files under a configured base dir),
`S3Store` (objects under a configured prefix). All are registered in
`registry.ts`. `getActiveStore(): Promise<ContentStore>` reads the active
`storage_backends` row and returns the matching implementation. Git is **not** a
`ContentStore` (it is write-only export, see D5).

Services (`pages.ts`, `revisions.ts`) call `getActiveStore()` for markdown
get/put instead of touching `content_source` directly. The Database
implementation keeps using `content_source`, so existing data needs no backfill.

### D2 — Content asset model & image references

- **Markdown** is addressed by `revisionId` (no new row needed; the revision IS
  the record). Its fingerprint is the existing `page_revisions.content_hash`.
- **Images** get a `content_assets` row (`id`, `kind='image'`, `content_hash`,
  `content_type`, `size_bytes`, `created_at`, `deleted_at`). Bytes live in the
  active store. `content_asset_refs(asset_id, revision_id)` records which
  revisions reference each image (populated on save by scanning saved Markdown for
  `/api/assets/{id}`).
- Markdown stores image references as **app-relative URLs**
  `![alt](/api/assets/{assetId})` — never backend paths (FR-004).

### D3 — Image upload & permission-checked serving

- `POST /api/assets` (multipart) — auth required (editor/admin via role, or a key
  with `edit`/`create` scope ∩ role). Validates size (configurable max) and mime
  (allowlist), computes `content_hash`, dedups by hash, writes bytes to the active
  store, inserts/returns `{ id, url }`. Rejection → localized error, no reference
  (FR-003).
- `GET /api/assets/{id}` — resolves the asset's referencing page(s); if none yet
  (freshly uploaded, not saved), the uploader may read it; otherwise requires
  `read` on a referencing page via `can()`. Streams bytes from the active store
  with the stored content type. Unreadable → 404 (no existence leak). Missing
  bytes (backend down) → handled by the renderer as a placeholder (Edge Cases).

### D4 — Storage backend configuration (admin)

- New `storage_backends` table: `id`, `type` (`database|local|s3|git`), `purpose`
  (`primary|git_export`), `is_active` (bool), `config` (JSONB, non-secret),
  `secret_encrypted` (text, nullable), timestamps. Exactly one
  `purpose='primary'` row is `is_active`. The `git_export` row is independent
  (`is_active` = enabled).
- Secrets (S3 keys, Git token) encrypted with the existing `encryptKey`; never
  returned to the client (API returns a `hasSecret` boolean). Non-secret config
  is returned for display/edit.
- `POST /api/storage/test` validates config + runs `healthCheck()` before
  activation (FR-015). All storage routes require `manage_storage` (admin).
- Admin UI at `/admin/storage`: shows active backend, per-backend config forms,
  test button, Git export toggle, and a "switch backend" action that launches a
  migration.

### D5 — Git one-way export (pg-boss job)

- A `git_export` backend row holds remote URL, branch, and an encrypted token.
- On successful `publish`, enqueue a `git-export` pg-boss job carrying the page
  path + version. The handler clones/opens a working dir (cached on the volume),
  writes `{path}.md` (Markdown + frontmatter) and referenced images under an
  `assets/` folder, commits, and pushes via `isomorphic-git` over HTTPS.
- Failures are recorded on the job and retried with backoff; they **never** fail
  the publish (FR-009 edge case). DB stays source of truth; external commits are
  ignored.

### D6 — Safe migration (pg-boss job + state machine)

Implements R5. A `content_migrations` row tracks
`source_backend_id`, `target_backend_id`, `status`
(`pending|copying|verifying|completed|failed|aborted`), `total_items`,
`copied_items`, `verified_items`, `error_message`, timestamps, `created_by`.

- `POST /api/storage/migrations` (admin, `manage_storage`): validates target
  config, single-flight guard, non-empty-target confirmation, then enqueues the
  job and returns the migration id immediately (P6).
- The job: set read-only flag → copy all markdown (per revision) + images
  (per asset) to target → verify every item by fingerprint + count → on success
  flip `is_active` in one transaction and clear the flag → on failure keep
  original active, retain all data, record reason, clear flag.
- **Write-lock**: while a migration is active, `pages.create/newDraft`,
  `revisions.publish`, and `POST /api/assets` check the flag and throw a localized
  `STORAGE_MIGRATING` domain error (HTTP 423). Reads are unaffected (FR-019).
- `GET /api/storage/migrations/{id}` returns progress for the admin UI (polled).
- Boot recovery re-queues an interrupted migration; idempotent content-addressed
  writes make re-runs safe (FR-022).

### D7 — pg-boss bootstrap (first job infra)

- New `src/server/jobs/` module: `boss.ts` (singleton pg-boss instance bound to
  `DATABASE_URL`), `register.ts` (explicit registration of `content-migration`
  and `git-export` handlers — P9), and the handlers. Started once from the server
  bootstrap (an `instrumentation.ts` register hook or the existing start path),
  guarded so tests can run without a live worker.
- pg-boss creates its own schema in PostgreSQL on first run (idempotent) — no new
  service, consistent with P1.

### D8 — New permission scopes & actions

Per R9: extend `api_key_scope` enum (`storage`, `preferences`); add Actions
`manage_storage`, `manage_preferences`; add Resource kinds `storage`,
`preferences`; extend `scopeToActions` and `roleAllows`
(`manage_storage` → admin only; `manage_preferences` → any signed-in user).
Existing `/api/user/preferences` route gains the `manage_preferences` check so a
`preferences`-scoped key can drive it. Scope ∩ role enforced in `can()` (FR-024).
All such calls flow through the existing `withApiAudit` wrapper (FR-025).

### D9 — `content_source` becomes nullable; read path

Migration makes `page_revisions.content_source` nullable (non-DB backends store
markdown externally). All reads of markdown go through `getActiveStore().
getMarkdown(revisionId)`. The DatabaseStore returns `content_source`; Local/S3
stores read the external file. Existing revisions keep their `content_source`
until (optionally) cleaned up after a verified migration away from Database.

## Project Structure

### Documentation (this feature)

```text
specs/003-content-storage-backends/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Schema increments
├── contracts/
│   ├── rest-api.md      # New REST endpoints (assets, storage, migrations)
│   └── content-store.md # ContentStore interface + backend contract
├── quickstart.md        # Local dev + Docker setup for each backend
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (new + modified)

```text
apps/web/
├── app/
│   ├── (admin)/admin/
│   │   └── storage/
│   │       ├── page.tsx                  # NEW: active backend, config, switch
│   │       └── migrations/[id]/page.tsx  # NEW: migration progress detail
│   └── api/
│       ├── assets/
│       │   ├── route.ts                  # NEW: POST upload image
│       │   └── [id]/route.ts             # NEW: GET serve image (permissioned)
│       └── storage/
│           ├── route.ts                  # NEW: GET/PUT backend config
│           ├── test/route.ts             # NEW: POST health/connection test
│           └── migrations/
│               ├── route.ts              # NEW: POST start, GET list
│               └── [id]/route.ts         # NEW: GET status, POST abort
├── src/
│   ├── server/
│   │   ├── content-store/                # NEW
│   │   │   ├── types.ts                  # ContentStore interface + asset keys
│   │   │   ├── registry.ts               # getActiveStore() + registration (P9)
│   │   │   ├── database-store.ts         # content_source + content_blobs
│   │   │   ├── local-store.ts            # filesystem
│   │   │   └── s3-store.ts               # @aws-sdk/client-s3
│   │   ├── jobs/                         # NEW (first pg-boss infra)
│   │   │   ├── boss.ts                   # pg-boss singleton
│   │   │   ├── register.ts               # explicit handler registration
│   │   │   ├── content-migration.ts      # migration job handler (D6)
│   │   │   └── git-export.ts             # git export job handler (D5)
│   │   ├── services/
│   │   │   ├── content-assets.ts         # NEW: image asset CRUD + refs + dedup
│   │   │   ├── storage-config.ts         # NEW: backend config + secrets
│   │   │   ├── migration.ts              # NEW: start/guard/status/state machine
│   │   │   ├── pages.ts                  # MODIFIED: read/write markdown via store
│   │   │   ├── revisions.ts              # MODIFIED: publish enqueues git-export
│   │   │   └── user-center.ts            # MODIFIED: preferences via manage_preferences
│   │   ├── permissions/index.ts          # MODIFIED: new actions/scopes/resources
│   │   ├── git/export.ts                 # NEW: isomorphic-git push helper
│   │   ├── db/schema/
│   │   │   ├── enums.ts                  # MODIFIED: scope enum + new enums
│   │   │   └── index.ts                  # MODIFIED: new tables + content_source nullable
│   │   └── config.ts                     # MODIFIED: optional asset limits / local base path
│   ├── components/
│   │   ├── editor/
│   │   │   └── SplitMarkdownEditor.tsx    # MODIFIED: image button + paste/drop upload
│   │   └── admin/storage/                 # NEW UI
│   │       ├── StorageBackendForm.tsx
│   │       ├── BackendSwitchDialog.tsx
│   │       └── MigrationStatus.tsx
│   ├── instrumentation.ts                 # NEW or MODIFIED: start pg-boss worker
│   └── i18n/locales/
│       ├── en.ts                         # MODIFIED: storage/editor/migration keys
│       └── zh.ts                         # MODIFIED: mirror en.ts
└── packages/shared/src/
    ├── api-keys.ts                       # MODIFIED: add storage, preferences scopes
    ├── content-storage.ts                # NEW: Zod schemas (backend config, migration, asset upload)
    └── index.ts                          # MODIFIED: export new schemas
```

**Structure Decision**: Follows the existing monorepo layout. Server-only storage,
job, and git code lives under `src/server/` (never imported by client). Shared Zod
schemas in `packages/shared/`. The admin surface is one canonical route group
(`/admin/storage`). The ContentStore registry and pg-boss registration are the two
explicit entry points (P9) for the new subsystems.

## Complexity Tracking

> Justified new dependencies / deviations. None violate an invariant; each is the
> minimal way to meet a requirement while preserving P1's default footprint.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `pg-boss` as a default dependency | P6 mandates pg-boss for heavy async ops; migration + Git export are the first such ops. Runs inside PostgreSQL — no new service. | In-memory background tasks lose jobs on restart (violates FR-022) and contradict the explicit P6 mandate. |
| In-process pg-boss worker (not a separate container) | Single-instance small-team default stays one container (P1). | A separate worker container is unnecessary now; the constitution permits adding it later with the same image and no code change. |
| `@aws-sdk/client-s3` (optional) | Required to implement the S3 backend the user asked for. Loaded only when S3 is selected. | Hand-rolling S3 request signing is error-prone and reinvents a standard SDK. |
| `isomorphic-git` (optional) | One-way Git export without adding a system `git` binary to the Alpine runtime image. Pure JS. | `simple-git` shells out to a `git` binary absent from the runtime image, adding a system dependency and Dockerfile change. |
| `content_source` made nullable | Non-DB backends store markdown externally; the column can't stay NOT NULL. | Keeping it NOT NULL forces duplicating markdown into the DB even when an external backend is authoritative, defeating "剥离出数据库". |
| Read-only window during migration (vs. live dual-write) | Confirmed clarification; simplest correct design — no in-flight write tracking. | Live dual-write/replay adds significant complexity for availability not needed at small-team scale. |
| Git is export-only, not a 4th `ContentStore` | Confirmed clarification + Git Storage Sync mandate (DB source of truth, two-way blocked). | Treating Git as a read/write primary would require a conflict/merge model that is explicitly out of scope. |
