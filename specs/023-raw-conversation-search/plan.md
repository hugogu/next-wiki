# Implementation Plan: Raw Conversation Search

**Branch**: `023-raw-conversation-search` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-raw-conversation-search/spec.md`

## Summary

Add a Content > Data Sources setting for `wiki-ai-conversations`, default disabled, that captures new Wiki AI chat sessions as append-only Raw pages filed under a protected built-in `Conversation` raw category. The Raw page becomes the canonical durable history record for captured sessions; the existing `ai_actions` / `ai_action_events` tables remain the execution/event stream and legacy-history fallback, but newly captured history surfaces resolve through the Raw page instead of creating a parallel chat-history store.

Technical approach: extend the existing 022 raw/page infrastructure with a small data-source settings table, system-protected raw categories, and AI-action pointer fields (`raw_conversation_page_id`, capture cursor/status metadata). Register a `raw-conversation-capture` pg-boss queue that coalesces Wiki AI events into Raw revisions, preserving append-only semantics while avoiding per-token synchronous page writes. Conversation Raw revisions store a text transcript as the search/embedding surface and compact structured conversation metadata for rendering. The raw reader dispatches the built-in Conversation category to a shared `ConversationSessionView` reused by AI Chat History detail. Hybrid search and semantic search are made fully space-aware for raw results, including Raw Conversation pages, with permission projection before any result/count/excerpt is returned.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Docker image Node 24)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, pg-boss, Zod, existing unified/remark renderer, existing pgvector-backed AI index, existing search coordinator, existing raw entry/category services from 022

**Storage**: PostgreSQL 16 with pgvector; schema changes generated only through Drizzle (`pnpm db:generate`), expected next migration after current `0028_*`

**Testing**: Vitest for services/routes/components; Playwright e2e for admin setting, AI chat capture, search result open, and Raw Conversation reader

**Target Platform**: Linux server via Docker Compose / Kubernetes using the existing app + worker image

**Project Type**: web-service monorepo (pnpm workspaces + Turborepo)

**Performance Goals**: conversation capture enqueue adds no visible delay to chat streaming; coalesced Raw page capture visible within 30 seconds for running sessions; terminal conversations are keyword-searchable within 2 minutes under normal indexing; header hybrid search remains within the existing 1.5 second UI target for available immediate results

**Constraints**: no new external service or storage subsystem; no new standalone chat-history table; existing legacy history is not migrated; Raw pages remain append-only; every Raw Conversation search/open path must recheck Raw permissions; public/anonymous pages and public navigation are unchanged; all new jobs/routes/services must be explicitly registered; API changes require OpenAPI docs regeneration via next-open-api

**Scale/Scope**: one data-source settings table; small additions to `raw_categories` and `ai_actions`; one capture service + one pg-boss queue; admin Content Data Sources UI; shared conversation detail component; Raw reader dispatch addition; updates to `/api/ai/sessions`, `/api/settings/...`, v1 raw category/resource shapes, search coordinator semantic space behavior, and tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Mandate | Verdict | Notes |
|---|---|---|
| P1 Simple deployment | PASS | Uses existing PostgreSQL and pg-boss; no new services or default dependencies |
| P2 AI-native, never vendor-locked | PASS | Captures existing provider-agnostic AI action events; no vendor SDK or model-specific storage |
| P3 Portable AI memory | PASS | Captured conversations become normal permission-scoped Raw pages and revisions; no second-class AI content table |
| P4 Rendering pipeline | PASS | Conversation Raw pages use a typed reader dispatch and shared chat components; generic rendering remains plugin-style |
| P5 Permissions first-class | PASS | Raw read permission gates capture page reads, search projection, semantic results, and raw asset/detail opens |
| P6 Style system & UI consistency | PASS | Data Sources and Conversation reader compose existing UI primitives and chat components |
| P7 Async-first | PASS | Capture work is queued/coalesced through pg-boss; request/stream handlers only enqueue lightweight work |
| P8 Version everything | PASS | Each captured snapshot/append creates immutable Raw revisions; no hard migration or rewrite of legacy history |
| P9 Open standards | PASS | REST + JSON contracts remain the public surface; OpenAPI regenerated for API changes |
| P10 Explicit over implicit | PASS | Data sources are registered by stable key; new queue registered in the job registry; no filesystem discovery |
| P11 Native navigation & unified entries | PASS | Search opens canonical Raw page URLs under `/spaces/raw/...`; history detail links to the same Raw page for captured sessions |
| P12 Public reading static by default | PASS | No anonymously readable published content changes; Raw Conversation pages are authenticated dynamic pages only |
| Search Retrieval Architecture | PASS | Raw Conversation search uses existing registered capabilities and coordinator permission projection |
| API Architecture | PASS | Internal settings/session routes and v1 resources call shared services/Zod schemas; MCP continues through v1 search/page tools |
| Frontend Data Flow | PASS | Settings/history/search use server state; selected search/page state remains URL-addressable |

**Public Content Delivery gate**: N/A. This feature does not change anonymous published page body, public metadata, or public navigation. Raw Conversation pages are Admin/authenticated Raw-space resources and must never enter public static/ISR output.

Gate result: **PASS — no violations, no justifications required.**

## Project Structure

### Documentation (this feature)

```text
specs/023-raw-conversation-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-delta.md
│   └── ui-contract.md
└── tasks.md              # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── src/server/
│   ├── db/schema/{index.ts,enums.ts}          # content data source settings, raw category protection, ai action raw-page pointer
│   ├── services/
│   │   ├── content-data-sources.ts            # registered Content > Data Sources settings
│   │   ├── raw-conversations.ts               # capture, transcript projection, renderer view model
│   │   ├── raw-categories.ts                  # built-in Conversation ensure/protection
│   │   ├── ai-actions.ts / ai-question.ts     # enqueue capture and expose captured-session pointers
│   │   ├── public-ai.ts / ai-retrieval.ts     # space-aware semantic submission/read scope
│   │   ├── public-content.ts                  # Raw Conversation resource/read helpers as needed
│   │   └── search/{coordinator.ts,candidate-projection.ts,engines/*}
│   ├── jobs/{register.ts,raw-conversation-capture.ts}
│   └── seed/index.ts                          # ensure data-source row and built-in category
├── app/
│   ├── api/settings/content-data-sources/route.ts
│   ├── api/ai/sessions/{route.ts,[id]/route.ts}
│   ├── api/v1/raw-categories/route.ts
│   └── (user)/spaces/[space]/[[...path]]/page.tsx
├── src/components/
│   ├── admin/ContentDataSourcesPanel.tsx
│   ├── chat/ConversationSessionView.tsx       # shared AI history + Raw Conversation detail renderer
│   ├── pages/raw-content/RawContentRenderer.tsx
│   └── user-center/AiSessionsPanel.tsx
└── messages/{en.json,zh-CN.json} / src/i18n/keys.ts

packages/shared/src/
├── content-data-sources.ts
├── pages.ts
└── ai.ts

packages/mcp-server/src/
└── shapes.ts / tools/list-raw-categories.ts   # expose built-in/system category metadata; existing search tools reused
```

**Structure Decision**: Keep all server logic in `apps/web/src/server`; shared schemas in `packages/shared`; UI composes existing `src/components/ui` and chat components. No new package or storage subsystem is introduced.

## Complexity Tracking

> No constitution violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0 -> Phase 1 Outputs

- `research.md` — decisions D1-D10; all planning unknowns resolved.
- `data-model.md` — entities, schema deltas, validation rules, and state transitions.
- `contracts/api-delta.md` — settings/session/v1/search API deltas and error codes.
- `contracts/ui-contract.md` — Admin Data Sources, AI History, Search, and Raw Conversation reader UX contract.
- `quickstart.md` — validation scenarios and command checklist.

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 design: all gates still PASS. The design uses normal Raw pages/revisions as the durable conversation record, keeps `ai_actions` as execution metadata rather than a duplicate history table, registers one pg-boss queue explicitly, preserves Raw permissions across lexical and semantic search, and changes no public static/ISR content.
