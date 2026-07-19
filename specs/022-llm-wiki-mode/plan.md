# Implementation Plan: Wiki Writing Modes — Copilot and LLM Wiki

**Branch**: `022-llm-wiki-mode` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-llm-wiki-mode/spec.md`

## Summary

Add an instance-level writing mode (`copilot` default, `llm-wiki`) to next-wiki. In LLM Wiki mode the deployment runs three content spaces on the existing page/revision machinery: `raw` (append-only, Admin-private evidence store that preserves original source format byte-identical — no OKF injection, no markdown conversion — and stores a dual-track form of extracted text + original bytes), `generated` (OKF-conformant, Admin-private AI working store with human/machine audit distinction), and the existing public `wiki` space, which gains softlink "link pages" that publish generated content at wiki paths without copying. Raw entries are filed under an admin-managed category taxonomy (`raw_categories`) that AI curation jobs and any future auto-archive workflows use as the primary filing dimension. The mode is chosen in first-run onboarding (new step before sample pages) and switchable in admin settings. Switching back establishes a content-write barrier, then transactionally moves raw/generated pages in place into the wiki space under `raw/…` / `generated/…` prefixes and materializes valid link pages without changing page or revision identities. REST v1 and MCP gain space-scoped access, durable per-append source metadata (stored in `page_revisions.source_metadata`, NOT in the body), an origin field (actor kind / content nature) on pages and revisions, raw-specific filters (`filterInputKind`, `filterCategoryId`) that are independent from the generated-space OKF `filterType`, and an admin API + MCP tool for the raw category taxonomy; the transfer service gains a generated-space OKF export that preserves each concept's source frontmatter.

Primary technical approach: extend the existing multi-space-ready schema (`spaces.kind`, `pages.kind` + `link_target_page_id` + `nature` + `visibility` + `raw_category_id`, `page_revisions.actor_kind` + `source_metadata` + `original_asset_id` + `link_target_page_id` + a broadened open-string `content_type`, the new `raw_categories` table, and pending-switch fields on `writing_mode_settings`), enforce space-kind rules inside the existing `can()` chokepoint and page services, de-hardcode `DEFAULT_SPACE_SLUG` behind a space resolver, and expose everything through the existing REST v1 facade and MCP tool registry. Raw entry storage reuses the existing 003 content-store architecture: extracted text in `page_revisions.content_source` (default surface for search/AI) and original bytes in `content_assets` referenced via `page_revisions.original_asset_id` (default surface for verbatim viewing/download). All content mutations take a shared lock on the writing-mode row; switch-back takes the conflicting update lock, marks the switch pending, and runs the move/link conversion/mode flip in one worker transaction.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Docker image Node 24)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, pg-boss, Zod, `yaml` (frontmatter, already used by 005), unified/remark pipeline, @modelcontextprotocol/sdk (`packages/mcp-server`)

**Storage**: PostgreSQL 16 (existing instance, pgvector present); all new state in existing DB via generated Drizzle migrations (`pnpm db:generate`, beginning at index 0022)

**Testing**: Vitest (unit/integration, `pnpm --filter @next-wiki/web test`), Playwright e2e (`test:e2e`)

**Target Platform**: Linux server (Docker Compose, single app + worker image)

**Project Type**: web-service (pnpm workspaces + Turborepo monorepo)

**Performance Goals**: no new targets beyond existing baselines — public pages static/ISR (`revalidate=300`), search coordinator p95 < 1s, mode-switch migration processed as a background job with TanStack Query progress polling; reads remain available while content writes are paused

**Constraints**: raw space append-only must hold under concurrent appends (per-page version increment inside a transaction, existing `newDraft` pattern); source metadata for each append must remain immutable on its revision; **raw entry bodies must preserve original source format byte-identical (no OKF injection, no markdown conversion) and OKF conformance applies to the generated space only** (2026-07-19 clarification); raw entry storage is dual-track (extracted text in `content_source`, original bytes in `content_assets` referenced via `original_asset_id`) and MUST reuse the existing 003 content-store backends without a new storage subsystem; every raw entry has exactly one immutable `raw_category_id`; no new external services or default dependencies (constitution P1); OKF v0.1 conformance applies both to generated page sources and the emitted bundle, including reserved-filename rules; switch-back must be atomic with stable page/revision identities and no concurrent content writes; `pnpm db:generate` is the only way to produce the migration (AGENTS.md rule)

**Scale/Scope**: 3 spaces; ~10 services to de-hardcode from `DEFAULT_SPACE_SLUG`; foundational schema migrations touching 3 tables + 1 new singleton table + 1 new `raw_categories` table + 6 enums (+ broadening of `page_revisions.content_type` from closed enum to open string) and the existing setup-step enum; collection/search/create v1 routes extended + 1 new append sub-resource + 2 settings/setup endpoints + 1 raw-category admin API surface; MCP: 6 tools extended + 2 new tools (`append_raw_entry`, `list_raw_categories`); one additional OKF archive writer on the existing transfer queue; raw reader UI gains content-type-aware renderer dispatch (PDF/HTML/JSON/image/log/markdown/plain) and verbatim-download affordance; Navigator/setup wizard/admin UI additions; 1 new pg-boss queue

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Mandate | Verdict | Notes |
|---|---|---|
| P1 Simple deployment | PASS | No new services or default dependencies; singleton settings table only |
| P2 AI-native, never vendor-locked | PASS | OKF is an open format, not a vendor; no LLM calls added by this feature; generated pages retain the normal draft→publish confirmation flow |
| P3 Portable AI memory | PASS | raw/generated are permission-scoped and retrieval-visible through the same services; AI-authored and human-authored content share identical tables, revision model, and permission checks — separation is by *space kind* (an organizational partition), never by parallel storage or unversioned write paths, so the "AI content as second-class" anti-pattern is not triggered |
| P4 Rendering pipeline | PASS | Link pages resolve target content through the normal revision/render path; no renderer changes |
| P5 Permissions first-class | PASS | Space-kind rules are evaluated inside the `can()` chokepoint (new `spaceKind` input) plus service guards; anonymous read remains the per-space `anonymousRead` flag; raw/generated default to Admin-only |
| P6 Style system & UI consistency | PASS | New controls compose existing `src/components/ui/` primitives and design tokens; no feature-local primitives or inline visual constants |
| P7 Async-first | PASS | Mode-switch migration runs as a pg-boss job (`writing-mode-switch` queue) registered explicitly in `jobs/register.ts`; API returns job id, UI polls status |
| P8 Version everything | PASS | Raw appends and link retargets create immutable revisions; migration moves pages in place so page/revision identifiers and all related records remain unchanged; link materialization adds a machine-authored immutable revision; page deletion stays soft — raw simply forbids it |
| P9 Open standards | PASS | OKF v0.1 for generated space; REST + OpenAPI extended; no proprietary protocol |
| P10 Explicit over implicit | PASS | New queue registered in `register.ts`; new routes/services explicitly imported; no runtime discovery |
| P11 Native navigation & unified entries | PASS | Space selection is URL-addressable (`/spaces/[space]/...` for raw/generated; wiki paths unchanged); authenticated space routes render route/tree-derived breadcrumbs; link pages are canonical at their wiki path only |
| P12 Public reading static by default | PASS | Link pages render through the existing `(public)/[...path]` ISR route; see gate below |
| API architecture mandate | PASS | All new surface goes through the shared service layer + Zod schemas in `packages/shared`; MCP wraps the same v1 API; `can()` never bypassed |
| Frontend Data Flow mandate | PASS | Space selection is URL-derived and job status is server state polled through TanStack Query; no server state is placed in Zustand |
| Public Content Delivery gate | PASS | **Representation**: link pages are anonymously readable and render through the existing `force-static` + `revalidate=300` `(public)/[...path]` route — the cached body contains only the resolved target content (no session data or generated target path/title). Public resources and sitemap entries expose the wiki link URL but not target metadata. **Invalidation**: publishing/unpublishing/deleting/retitling a generated target calls `invalidatePublicContentCache()` (existing tag + root-layout path) **plus** `revalidatePath` for every live link page whose `link_target_page_id` equals the target; creating/deleting/retargeting a link page invalidates its own wiki path and the nav tree. The space switcher and link badge are personalized controls composed outside the cached document body. raw/generated spaces never enter the public cache |

Gate result: **PASS — no violations, no justifications required.**

## Project Structure

### Documentation (this feature)

```text
specs/022-llm-wiki-mode/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions D1-D13
├── data-model.md        # Phase 1 output — entities, validation, transitions
├── quickstart.md        # Phase 1 output — verification scenarios
├── contracts/
│   ├── v1-api-delta.md      # REST v1 endpoint/schema changes
│   ├── mcp-tools-delta.md   # MCP tool changes
│   └── okf-conformance.md   # Generated-space source format contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── src/server/
│   ├── db/schema/{index.ts,enums.ts}      # +space_kind,page_kind,actor_kind,content_nature,
│   │                                      #  page_visibility,writing_mode enums; spaces.kind;
│   │                                      #  pages.kind/link_target_page_id/nature/visibility/raw_category_id;
│   │                                      #  page_revisions.actor_kind/source_metadata/original_asset_id/link_target;
│   │                                      #  page_revisions.content_type broadened from enum to open text;
│   │                                      #  raw_categories table; writing_mode_settings + pending switch state
│   ├── db/migrations/0022_*..0025_*.sql   # via pnpm db:generate ONLY (0025 = raw dual-track + categories)
│   ├── permissions/index.ts               # +spaceKind input, admin-only + raw rules
│   ├── services/
│   │   ├── spaces.ts                      # NEW: space registry/resolver (replaces ~10 getDefaultSpace copies)
│   │   ├── writing-mode.ts                # NEW: mode singleton, write barrier, switch helpers
│   │   ├── raw-entries.ts                 # NEW: create/append guards, dual-track storage, input-kind metadata
│   │   ├── raw-categories.ts              # NEW: admin taxonomy CRUD, retire/replace, default handling
│   │   ├── link-pages.ts                  # NEW: create/retarget/delete link pages, target fan-out
│   │   ├── okf.ts                         # NEW: concept/path + bundle conformance (generated-only)
│   │   ├── pages.ts / revisions.ts / public-content.ts  # space-aware, link resolution, provenance, raw-immutable guards
│   │   ├── search/candidate-projection.ts + engines/    # space-kind-aware projection, filterInputKind/filterCategoryId
│   │   ├── transfer-export.ts             # space-aware snapshot for portable/OKF exports
│   │   └── setup.ts                       # +writing_mode step transitions
│   ├── jobs/{runtime.ts,register.ts,writing-mode-switch.ts,transfer-export.ts}
│   │                                               # NEW switch queue + OKF export branch
│   ├── transfers/okf-archive-writer.ts            # NEW: preserves concept frontmatter
│   └── seed/index.ts                      # ensure raw/generated spaces + empty raw_categories (all modes)
├── app/
│   ├── api/v1/...                         # +space query param; +filterInputKind/filterCategoryId on /pages and /search/pages;
│   │                                      # +pages/[id]/appends; +settings/writing-mode; +settings/raw-categories (admin CRUD)
│   ├── api/setup/writing-mode/route.ts    # NEW
│   ├── (user)/spaces/[space]/[...path]/   # NEW authenticated raw/generated reader routes (content-type-aware renderer dispatch)
│   ├── (admin)/admin/writing-mode/page.tsx# NEW admin page + confirm dialog
│   ├── (admin)/admin/raw-categories/...   # NEW admin taxonomy CRUD page
│   └── setup/                             # +WritingModeStep (before sample_pages)
├── src/components/
│   ├── layout/Navigator.tsx               # +space switcher (admin, llm-wiki mode)
│   ├── pages/                             # link badge, human-modified indicator, raw-content renderer dispatcher
│   │                                      # (PDF / HTML / JSON / image / log / markdown / plain + Download original)
│   ├── admin/RawCategoriesManager.tsx     # NEW
│   └── setup/WritingModeStep.tsx          # NEW
└── src/i18n/locales/{en.ts,zh.ts}         # new strings

packages/shared/src/                       # page/revision resource + query schemas (origin, kind, linkTarget,
                                            # originalAsset, categoryId, contentType, space filters, filterInputKind,
                                            # filterCategoryId), setup step enum, raw category resource, new error codes
packages/mcp-server/src/                   # space params on read/create tools, +append_raw_entry, +list_raw_categories,
                                            # list filters + provenance/resource shaping
```

**Structure Decision**: Follows the binding monorepo layout (constitution Project Structure mandate). All server logic in `apps/web/src/server/`; shared Zod contracts in `packages/shared/`; MCP surface in `packages/mcp-server/`; UI primitives remain in `src/components/ui/` — feature components only compose them.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0 → Phase 1 outputs

- `research.md` — decisions D1–D13 with rationale and alternatives (all Technical Context unknowns resolved; no NEEDS CLARIFICATION remains)
- `data-model.md` — schema delta, entity fields, validation rules, state transitions
- `contracts/` — v1 API delta, MCP tool delta, OKF conformance contract
- `quickstart.md` — end-to-end verification scenarios

## Post-design Constitution re-check

Re-evaluated after Phase 1 design: all gates above still PASS. Design introduces no new violations: singleton settings table follows the `setup_progress` CHECK-constraint pattern; every content write participates in the mode-row barrier; the migration job follows the explicit-registration rule and commits atomically; authenticated space routes include breadcrumbs; TanStack Query owns job polling; public delivery keeps personalized controls out of the ISR body.
