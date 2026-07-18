# Implementation Plan: Wiki Writing Modes — Copilot and LLM Wiki

**Branch**: `022-llm-wiki-mode` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-llm-wiki-mode/spec.md`

## Summary

Add an instance-level writing mode (`copilot` default, `llm-wiki`) to next-wiki. In LLM Wiki mode the deployment runs three content spaces on the existing page/revision machinery: `raw` (append-only, admin-only evidence store), `generated` (OKF-conformant, admin-only AI working store with human/machine audit distinction), and the existing public `wiki` space, which gains softlink "link pages" that publish generated content at wiki paths without copying. The mode is chosen in first-run onboarding (new step before sample pages) and switchable in admin settings; switching back migrates raw/generated pages into the wiki space as native pages under `raw/…` / `generated/…` prefixes via a pg-boss job, with per-source-space visibility choice and a mandatory confirmation. REST v1 and MCP gain space-scoped access plus an origin field (actor kind / content nature) on pages and revisions.

Primary technical approach: extend the existing multi-space-ready schema (`spaces.kind`, `pages.kind` + `link_target_page_id` + `nature` + `visibility`, `page_revisions.actor_kind`), enforce space-kind rules inside the existing `can()` chokepoint and page services, de-hardcode `DEFAULT_SPACE_SLUG` behind a space resolver, and expose everything through the existing REST v1 facade and MCP tool registry.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Docker image Node 24)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, pg-boss, Zod, `yaml` (frontmatter, already used by 005), unified/remark pipeline, @modelcontextprotocol/sdk (`packages/mcp-server`)

**Storage**: PostgreSQL 16 (existing instance, pgvector present); all new state in existing DB via one generated migration (`pnpm db:generate`, next index 0022)

**Testing**: Vitest (unit/integration, `pnpm --filter @next-wiki/web test`), Playwright e2e (`test:e2e`)

**Target Platform**: Linux server (Docker Compose, single app + worker image)

**Project Type**: web-service (pnpm workspaces + Turborepo monorepo)

**Performance Goals**: no new targets beyond existing baselines — public pages static/ISR (`revalidate=300`), search coordinator p95 < 1s, mode-switch migration processed as a background job with progress polling

**Constraints**: raw space append-only must hold under concurrent appends (per-page version increment inside a transaction, existing `newDraft` pattern); no new external services or default dependencies (constitution P1); OKF v0.1 conformance at page-source level for the generated space; `pnpm db:generate` is the only way to produce the migration (AGENTS.md rule)

**Scale/Scope**: 3 spaces; ~10 services to de-hardcode from `DEFAULT_SPACE_SLUG`; 1 schema migration touching 3 tables + 1 new singleton table + 5 enums; ~8 v1 route groups extended + 1 new append sub-resource + 2 settings/setup endpoints; MCP: ~7 tools extended + 1 new tool; Navigator/setup wizard/admin UI additions; 1 new pg-boss queue

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Mandate | Verdict | Notes |
|---|---|---|
| P1 Simple deployment | PASS | No new services or default dependencies; singleton settings table only |
| P2 AI-native, never vendor-locked | PASS | OKF is an open format, not a vendor; no LLM calls added by this feature |
| P3 Portable AI memory | PASS | raw/generated are permission-scoped and retrieval-visible through the same services; AI-authored and human-authored content share identical tables, revision model, and permission checks — separation is by *space kind* (an organizational partition), never by parallel storage or unversioned write paths, so the "AI content as second-class" anti-pattern is not triggered |
| P4 Rendering pipeline | PASS | Link pages resolve target content through the normal revision/render path; no renderer changes |
| P5 Permissions first-class | PASS | Space-kind rules are evaluated inside the `can()` chokepoint (new `spaceKind` input) plus service guards; anonymous read remains the per-space `anonymousRead` flag; raw/generated default to admin-only |
| P7 Async-first | PASS | Mode-switch migration runs as a pg-boss job (`writing-mode-switch` queue) registered explicitly in `jobs/register.ts`; API returns job id, UI polls status |
| P8 Version everything | PASS | Raw appends and link retargets create immutable revisions; migration preserves revision history (same version numbers, authors, timestamps); page deletion stays soft — raw simply forbids it |
| P9 Open standards | PASS | OKF v0.1 for generated space; REST + OpenAPI extended; no proprietary protocol |
| P10 Explicit over implicit | PASS | New queue registered in `register.ts`; new routes/services explicitly imported; no runtime discovery |
| P11 Native navigation & unified entries | PASS | Space selection is URL-addressable (`/spaces/[space]/...` for raw/generated; wiki paths unchanged); link pages are canonical at their wiki path only |
| P12 Public reading static by default | PASS | Link pages render through the existing `(public)/[...path]` ISR route; see gate below |
| API architecture mandate | PASS | All new surface goes through the shared service layer + Zod schemas in `packages/shared`; MCP wraps the same v1 API; `can()` never bypassed |
| Public Content Delivery gate | PASS | **Representation**: link pages are anonymously readable and render through the existing `force-static` + `revalidate=300` `(public)/[...path]` route — the cached body contains only the resolved target content (no session data). **Invalidation**: publishing/unpublishing/deleting/retitling a generated target calls `invalidatePublicContentCache()` (existing tag + root-layout path) **plus** `revalidatePath` for every live link page whose `link_target_page_id` equals the target; creating/deleting/retargeting a link page invalidates its own wiki path and the nav tree. The space switcher and link badge are personalized controls composed outside the cached document body. raw/generated spaces never enter the public cache |

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
│   │                                      #  pages.kind/link_target_page_id/nature/visibility;
│   │                                      #  page_revisions.actor_kind; writing_mode_settings
│   ├── db/migrations/0022_*.sql           # via pnpm db:generate ONLY
│   ├── permissions/index.ts               # +spaceKind input, admin-only + raw rules
│   ├── services/
│   │   ├── spaces.ts                      # NEW: space registry/resolver (replaces ~10 getDefaultSpace copies)
│   │   ├── writing-mode.ts                # NEW: mode singleton get/switch + guard helpers
│   │   ├── raw-entries.ts                 # NEW: create/append guards, input-kind metadata
│   │   ├── link-pages.ts                  # NEW: create/retarget/delete link pages, target fan-out
│   │   ├── pages.ts / revisions.ts / public-content.ts  # space-aware, link resolution, provenance
│   │   ├── search/candidate-projection.ts + engines/    # space-kind-aware projection
│   │   └── setup.ts                       # +writing_mode step transitions
│   ├── jobs/{runtime.ts,register.ts,writing-mode-switch.ts}  # NEW queue + handler
│   └── seed/index.ts                      # ensure raw/generated spaces exist (all modes)
├── app/
│   ├── api/v1/...                         # +space query param; +pages/[id]/appends; +settings/writing-mode
│   ├── api/setup/writing-mode/route.ts    # NEW
│   ├── (public)/spaces/[space]/[...path]/ # NEW authenticated raw/generated reader routes
│   ├── (admin)/admin/writing-mode/page.tsx# NEW admin page + confirm dialog
│   └── setup/                             # +WritingModeStep (before sample_pages)
├── src/components/
│   ├── layout/Navigator.tsx               # +space switcher (admin, llm-wiki mode)
│   ├── pages/                             # link badge, human-modified indicator
│   └── setup/WritingModeStep.tsx          # NEW
└── src/i18n/locales/{en.ts,zh.ts}         # new strings

packages/shared/src/                       # page/revision resource + query schemas (origin, kind,
                                           # linkTarget, space filters), setup step enum
packages/mcp-server/src/                   # space params on read/create tools, +append_raw_entry,
                                           # filterType for OKF type filtering
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

Re-evaluated after Phase 1 design: all gates above still PASS. Design introduces no new violations: singleton settings table follows the `setup_progress` CHECK-constraint pattern; the migration job follows the explicit-registration rule; public delivery keeps personalized controls out of the ISR body.
