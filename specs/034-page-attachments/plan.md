# Implementation Plan: Page Attachments

**Branch**: `034-page-attachments` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-page-attachments/spec.md`

## Summary

Let a page author attach supported image, video, and document files to a page (separate from
inline-embedded images) and let any reader with page-read access download
them, through the web UI, the public content API, and MCP tooling alike.
Attachments reuse the existing image storage foundation (`content_assets` +
`content_blobs`, with the same pluggable Database/Local/S3 replicas) by
adding a new asset `kind: 'attachment'`, and a new `page_attachments` table
that links an asset to a page directly (not through revision-content
scanning, since attachments are not embedded in Markdown). Writing
(attach) via API key or MCP requires a new, independently-grantable
`attachments` permission scope layered on top of the credential's existing
page-read access; removal uses the established page-edit permission. Reading
(list/download) requires no new scope and follows
the same page-read permission already used everywhere else. An admin-facing
settings surface (mirroring the existing `/api/settings/*` pattern) makes the
per-file size cap (default 20 MB — deliberately kept small, per the
Architecture Review clarification, so attaching stays a simple synchronous
request rather than requiring a background-job delivery model) and accepted
type categories configurable, replacing today's hardcoded image-only env
values for this new surface without touching the existing image upload path.
Downloads use a type-appropriate `Content-Disposition` (inline only for a
fixed, hand-picked "cannot execute code in this origin" allowlist such as
PDF and raster images; forced download for everything else, unconditionally).
Oversized uploads are rejected outright — the whole request is buffered and
measured before any bytes are persisted, so nothing is ever partially
written.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime
floor) — matches the rest of the monorepo; no new language/runtime.

**Primary Dependencies**: Next.js 16 App Router route handlers, Drizzle ORM
(PostgreSQL), Zod (`@next-wiki/shared`), existing `content-store/*` blob
read/write/replication helpers, existing MCP server SDK tool registration
(`packages/mcp-server`). No new third-party dependency is introduced — file
"type category" detection reuses the project's existing magic-byte sniffing
approach (`content-store/image-validation.ts` pattern), extended to a small
number of additional container/document signatures plus a declared-MIME
fallback for types with no reliable magic number (e.g. plain text, many
Office/OpenDocument formats already rely on ZIP-container sniffing which is
tractable without a new library).

**Storage**: PostgreSQL 16+ (existing). Attachment bytes reuse
`content_assets` (metadata, new `kind = 'attachment'`) + `content_blobs`
(bytes) + the existing pluggable Local/S3 replica mechanism
(`storage_backends`, `storage_replication_tasks`) — no new storage
subsystem. A new `page_attachments` join table (page ↔ asset, with the
per-attachment original file name) and a new singleton
`attachment_settings` table (admin-configured max size + allowed
categories) are added via `pnpm db:generate`. A new `ApiKeyScope` enum value
(`attachments`) requires a Drizzle-generated migration on
`api_key_scope` (Postgres enum).

**Testing**: Vitest (unit/integration, colocated `*.test.ts` beside each new
service module, following `content-assets.test.ts` /
`content-assets-permissions.test.ts` conventions) + Playwright (E2E for the
web attach/download/remove flow) — existing project tooling, no new
framework.

**Target Platform**: Server-side Next.js app (Docker Compose / Kubernetes,
per constitution P1); no platform-specific code.

**Project Type**: Web application (existing `apps/web` monorepo app) +
existing `packages/shared` (Zod contracts) + existing `packages/mcp-server`
(MCP tools). No new package.

**Performance Goals**: Matches SC-001 (attachment visible/downloadable
within 10s for files up to the 20 MB default limit) — no new performance
target beyond what the existing image/asset read-write path already meets;
uploads up to 20 MB are handled by the same in-memory buffer-then-validate
approach already used for images (`Buffer.from(await file.arrayBuffer())`),
which today defaults to a 10 MB image cap, so server-side hash+write time
stays well under the constitution's 500ms threshold (see Constitution Check
P7 below) — this plan confirmed (Phase 0) that no framework- or proxy-level
body-size ceiling silently truncates or rejects a 20 MB request before
application code can produce the FR-011/FR-011a "whole-file refusal with
reason" behavior.

**Constraints**: FR-011a (reject over-size uploads in full, never truncate
and store a partial file) is the binding constraint driving the upload
implementation: size MUST be checked against the fully-buffered request
before any write to `content_blobs`/replicas begins, exactly like
`validateImage` already does for images (`bytes.length > maxBytes` check
before any store call). FR-014's forced-download vs. inline-safe
distinction MUST be a fixed, code-level allowlist — never influenced by
runtime admin configuration — so a future admin cannot accidentally mark an
executable-content type as browser-inline.

**Scale/Scope**: Single wiki instance (personal-by-default, per constitution
P1); no distinct scale target beyond the existing single-Postgres,
zero-extra-service deployment. Feature adds: 1 new DB table
(`page_attachments`), 1 new singleton settings table
(`attachment_settings`), 1 new `content_assets.kind` value, 1 new
`ApiKeyScope` enum value, ~4 new REST endpoints, ~3 new MCP tools, 1 new
admin settings page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **P1 (Simple Deployment)**: No new service, dependency, or baseline
  footprint. Attachments run entirely on the existing PostgreSQL-only
  default deployment; S3/Local replicas remain optional, exactly as for
  images today. PASS.
- **P2/P3 (AI-Native, Portable Memory)**: Attachments are ordinary auditable
  page-associated content reachable identically by the manual editor, the public API,
  and MCP — no AI-only code path, no vendor SDK dependency. Attaching a file
  via MCP goes through the same shared upload capability and permission
  chokepoint as the web UI (FR-006), so AI-authored and human-authored
  attachments are indistinguishable to storage/permissions, matching the
  Anti-Pattern ban on "AI content as second-class". PASS.
- **P5 (Permissions First-Class)**: Every new read and write path (list,
  download, attach, remove) is gated through the single `can()` chokepoint,
  extended with one new `Action` (`attach_file`) and one new `Resource`-scope
  interaction, never a bespoke check. Anonymous read of attachments is
  derived from the existing page-visibility/anonymous-read configuration,
  not a new special case. PASS.
- **P7 (Async-First for Heavy Operations)**: **RESOLVED — PASS.** An
  architecture review (spec's "Architecture Review" clarification) flagged
  that a 100 MB synchronous upload could plausibly exceed the constitution's
  500ms threshold and sit within its "large asset processing" examples,
  which a staged upload + pg-boss finalization/status flow would properly
  address — but at a UX and implementation-complexity cost (SC-001's
  near-immediate "attach and see it" experience becomes a submit-then-poll
  flow) disproportionate to this feature's scope. Instead, the default
  maximum attachment size was lowered from 100 MB to **20 MB**
  specifically so the operation stays outside P7's threshold by
  construction: the actual server-side work per attachment (magic-byte
  sniffing, sha256 hashing, one `content_blobs` write) is a small, roughly
  linear function of byte count, and 20 MB keeps that work in the same
  sub-second range the already-shipped, never-flagged 10 MB image-upload
  path already runs in on ordinary hardware — this is a genuine size
  reduction that removes the risk, not a re-assertion of the earlier
  "network transfer time doesn't count" argument the review rejected. An
  administrator who raises the configured limit beyond the default
  knowingly trades away that guarantee (documented in spec.md's Assumptions);
  revisit with a staged/async design if a future need for materially larger
  attachments (e.g. long-form video) arises.
- **P8 (Version Everything)**: Attachments are **not** modeled as page
  revisions — mirroring the existing precedent that page property changes
  (`pages.updateProperties`: title/path) mutate the `pages` row directly
  without a new `page_revisions` row, because they are not the page's
  *content*. Attach/detach are audited on the `page_attachments` row itself
  (`created_at`/`uploaded_by`, `removed_at`/`removed_by`) rather than via a
  new revision. This is a deliberate, spec-confirmed scope boundary
  (Clarification: "no dedicated replace/versioning operation"), not an
  oversight — flagged here explicitly since P8's literal text ("every page
  save MUST create an immutable revision") could otherwise read as requiring
  it. Documented as the P8 interpretation this feature relies on; no
  violation, since attachment metadata is not "page content" in the sense
  `page_revisions` versions (source/HTML/hash).
- **P9 (Open Standards)**: New REST endpoints follow the existing
  `/api/v1/*` OpenAPI-documented public contract and JSON:API-adjacent
  conventions already used for assets; no proprietary protocol. PASS.
- **P11 (Native Web Navigation & Unified Entry Points)**: New resources
  (`/api/v1/pages/{pageId}/attachments`, `/api/v1/attachments/{id}/content`)
  are RESTful nouns, not verbs; the web attachment list/download UI lives on
  the existing page view route (no new canonical page route needed — it is
  a panel within the existing page, same as the existing image references),
  so no duplicate entry point is created. PASS.
- **Public Content Delivery (P12 / mandate)**: See the spec's "Public
  Content Delivery" section — attachment binaries are served on-demand
  (never embedded in the cached page HTML body), so adding/removing an
  attachment does not require invalidating the page's ISR/static
  representation; only the (uncached, permission-checked) attachment list
  fetch is affected. PASS — documented in data-model.md's cache-impact note.

No open Constitution Check gates remain. P7 is resolved via the 20 MB
default (above); Complexity Tracking is empty because no violation is being
accepted — the risk was designed away rather than justified.

## Project Structure

### Documentation (this feature)

```text
specs/034-page-attachments/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── attachments-api.md
└── tasks.md              # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
apps/web/
├── src/server/db/schema/
│   ├── index.ts                          # + pageAttachments, attachmentSettings tables
│   └── enums.ts                          # + 'attachments' value on apiKeyScopeEnum
├── src/server/permissions/
│   └── index.ts                          # + 'attach_file' Action, 'attachments' ApiKeyScope mapping
├── src/server/content-store/
│   └── attachment-validation.ts          # NEW: size/type-category validation (mirrors image-validation.ts)
├── src/server/services/
│   ├── page-attachments.ts               # NEW: attach/list/remove/getServable*, canAttach/canReadAttachment
│   ├── page-attachments.test.ts          # NEW
│   ├── page-attachments-permissions.test.ts  # NEW
│   └── attachment-settings.ts            # NEW: admin config read/write (mirrors storage-config.ts)
├── app/api/v1/
│   ├── pages/[id]/attachments/route.ts        # NEW: POST (attach), GET (list)
│   └── attachments/[id]/
│       ├── route.ts                               # NEW: DELETE (remove)
│       └── content/route.ts                       # NEW: GET (download; sets Content-Disposition)
├── app/api/settings/
│   └── attachments/route.ts               # NEW: GET/PUT admin settings (session-only, mirrors api/settings/*)
├── app/(admin)/admin/attachments/
│   └── page.tsx                           # NEW: admin settings UI (max size, allowed categories)
└── src/components/
    └── page/AttachmentsPanel.tsx          # NEW: reader/author-facing attachment list + attach/remove UI

packages/shared/src/
└── content-storage.ts                     # + contentAssetKindSchema 'attachment', attachment view/upload schemas

packages/mcp-server/src/
├── tools/
│   ├── attach-file.ts                     # NEW
│   ├── list-attachments.ts                # NEW
│   └── download-attachment.ts             # NEW
├── api-client.ts                          # + attachFile/listAttachments/downloadAttachment methods
└── server.ts                              # + tool registrations
```

**Structure Decision**: Existing monorepo layout (`apps/web` Next.js app +
`packages/shared` + `packages/mcp-server`); no new package or app. All new
files land inside the established `src/server/{db/schema,permissions,
content-store,services}` and `app/api/**` structure, following the same
module boundaries the existing image-asset feature already uses so
attachments are additive, not a parallel system.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty. (P7 was a
real risk at the original 100 MB default; it was resolved by lowering the
default to 20 MB — see Constitution Check above — rather than by accepting
a violation, so there is nothing to justify here.)*
