# Implementation Plan: Feishu Bot Conversation Capture

**Branch**: `025-feishu-bot-conversation-capture` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-feishu-bot-conversation-capture/spec.md`

## Summary

Wire Feishu bot Q&A through the existing Wiki AI chat pipeline so the 023 Raw Conversation capture machinery produces one Raw Conversation page per Feishu turn, indistinguishable from a Wiki AI web capture except for a `channel` metadata marker. Drop the now-misleading "Wiki AI" branding from the user-facing Data Source — admins see one `AI Conversations` toggle that covers every channel — and shrink the Feishu Bot Session surface so all conversation content lives in `ai_actions` / `ai_action_events` while the Bot Session carries only Feishu-side lifecycle state.

This is largely a thin verification + relabel pass: the wiring was already laid in by 004/019/023. The capture pipeline reaches Feishu turns because the Feishu delegation service (`apps/web/src/server/services/feishu-delegation.ts:98`) already calls `createWikiQuestion(...)`, which sets `rawConversationCaptureStatus='pending'` when the data source is enabled. The work here is to (a) rename the data-source key + admin label without resetting state, (b) extend the Raw Conversation source-metadata schema with a `channel` marker so operators and admin surfaces can tell a Feishu capture from a web capture, (c) propagate the channel marker through `RawConversationPointer` so the AI Chat History surfaces show the origin, and (d) add tests that prove a Feishu turn is captured, searchable, permission-gated, and that the existing turn-to-ai-action mapping in `feishu-sessions.ts` keeps producing one Raw page per turn.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+ runtime floor, Node 24 in the Docker image; React 19.2 and Next.js 16.2.

**Primary Dependencies**: Next.js App Router; Drizzle ORM; pg-boss; Zod; existing TanStack Query / Zustand / next-openapi-gen / unified-remark; existing `createWikiQuestion` / `createAction` / `raw-conversations` / `content-data-sources` services from 004/023; existing Feishu `handleInboundMessage` / `feishu-sessions` / `feishu-bindings` services from 019; existing `audit` service with `auditOriginEnum` (already includes `'feishu'`).

**Storage**: Existing PostgreSQL 16 with pgvector; the only persistent-key change is renaming the data-source row from `wiki-ai-conversations` to `ai-conversations` (see Migration section). No new tables or columns. Optional additive metadata on the per-revision `source_metadata` JSON column already documented in 023.

**Testing**: Vitest unit + integration against the dedicated PostgreSQL test database; Playwright admin/binding E2E; Feishu transport test double reused from 019; `docker compose up -d --build` for full-stack verification. Provider adapters untouched.

**Target Platform**: The existing single `web` Docker service; Feishu Module registration entry unchanged. No new container, profile, port, or required dependency.

**Project Type**: Full-stack web application, pnpm workspaces + Turborepo. Reuses the existing `apps/web/src/server/{services,jobs,db,api}` layout — no new directories inside the server module beyond a `__tests__/raw-conversations.feishu.test.ts` style file co-located with the captured behavior.

**Performance Goals**: No regression on the existing 023 capture path. Feishu capture enqueue remains on the same line as web capture. Conversation search remains within the header hybrid search's 1.5s immediate-results target for available results. Bot Session session-window reset still < 50 ms in p95 for the in-Feishu turn path.

**Constraints**: No new stateful service; no new external dependency; no parallel Feishu-only chat-history table; no parallel timeline of question/answer/citation/status on the Bot Session; Raw pages remain append-only; every Raw Conversation read or search hit must re-check Raw permissions; bot actions stay attributed to the bound wiki user and recorded under `audit_origin='feishu'`; rename of the data-source key must preserve the stored enabled/disabled state of every deployment; existing legacy `wiki-ai-conversations` rows remain functional during the rename window and are migrated in place; the existing 023 capture semantics (one Raw Conversation page per captured `wiki_question` action, multi-turn continuity lives in the Bot Session plus multiple per-turn Raw pages) are preserved.

**Scale/Scope**: One persistent key literal change; one renamed admin label; one additive `channel` field on the Raw Conversation source metadata schema; one additive `channel` field on `RawConversationPointer`; one `WikiAiChannel` Zod enum constant; one Feishu-specific capture worker test; one rename migration step inside the existing data-source settings table; one admin UI label rename in `apps/web/messages/{en,zh}.json`; no package or service split.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Source: `.specify/memory/constitution.md` v2.2.0 and linked architecture mandates.

| Principle / Mandate | Status | Design compliance |
|---|---|---|
| P1 Simple Deployment | PASS | No new service, container, profile, or required dependency. All work reuses the existing `web` image, pg-boss worker, and PostgreSQL state. |
| P2 AI-Native / Never Vendor-Locked | PASS | The pipeline does not change the provider-agnostic AI layer. Feishu is one channel feeding the same `createWikiQuestion` entry point, so provider routing stays pluggable. |
| P3 Portable AI Memory | PASS | The captured Feishu turn becomes a Raw Conversation page (Raw-space, append-only, permission-scoped, versioned), identical to a Wiki-AI-web capture except for the new `channel` marker. No second-class AI table, no parallel Feishu-only history store. |
| P4 Rendering Pipeline | PASS | The conversation renderer dispatch in 022/023 handles the new `channel` field as a typed render hint only; the renderer pipeline itself is unchanged. |
| P5 Permissions First-Class | PASS | Every Raw Conversation read (search, page open, history deep-link) re-checks Raw read permission. The Feishu integration does not bypass `can()`; the channel marker is metadata for admin visibility, not a permission grant. |
| P6 Style System & UI Consistency | PASS | The capture surface inherits the existing admin Data Sources panel primitives; the conversation detail component already feeds both AI Chat History and Raw Conversation reads. |
| P7 Async-First | PASS | Capture remains a coalesced pg-boss job; the Feishu turn does not introduce synchronous work in the request handler. |
| P8 Version Everything | PASS | Each capture writes a new immutable Raw revision. The `source_metadata` schema is versioned (`schemaVersion: 1`); extending it with `channel` is forward-compatible and the renderer tolerates absent markers. |
| P9 Open Standards | PASS | The Data Source update API and AI session list/detail endpoints stay REST + OpenAPI; `next-open-api` metadata is regenerated for the renamed source label and the additional `channel` field. |
| P10 Explicit Over Implicit | PASS | The data-source is still registered by stable key; the new key is published through `packages/shared/src/content-data-sources.ts`; the Feishu capture path is the same explicit handler as the web capture path. |
| P11 Native Navigation & Unified Entry Points | PASS | Every surface that points at a captured Feishu conversation (Search result, AI Chat History list/detail, search-result excerpt, Raw Conversation page, deep link) routes through the canonical Raw page URL and the canonical AI session detail URL. No new entry points. |
| P12 Public Reading Static by Default | PASS | This feature does not change anonymously readable content, public metadata, or public navigation. Raw Conversation pages remain authenticated Raw-space resources; the rename touches only Admin UI labels. |
| AI Knowledge Layer mandate | PASS | The derived indexing pipeline indexes captured Feishu turns the same way it indexes captured web turns; the `channel` field is metadata, not part of the indexed text. |
| AI Chat Side Pane mandate | PASS | The persistent AI chat side pane is the canonical Wiki AI surface; the Feishu turn reuses it. The data model continues to treat conversation `status` as the canonical lifecycle indicator for both channels. |
| Search Retrieval Architecture mandate | PASS | Raw Conversation search uses the registered retrieval coordinator; permission projection runs once and is shared by web and Feishu captures. No new capability is registered. |
| Frontend Routing & URL Contract mandate | PASS | Same URLs as 023 — `/spaces/raw/conversations/...` for Raw Conversation pages, plus the canonical AI session detail URL for the Feishu side. Breadcrumbs derive from the route hierarchy and the page tree. |
| Public Content Delivery mandate | N/A | The feature does not change anonymous published content, public metadata, or public navigation. No ISR/static cache impact. |
| Frontend Data Flow mandate | PASS | Server state via TanStack Query (settings + history), URL state for filters, Zustand for local chat UI. No new state surface introduced. |
| API Architecture mandate | PASS | Route handlers are thin adapters over shared Zod schemas. Internal settings/sessions routes and the v1 raw resource shapes are the only changed APIs; `next-open-api` regenerates accordingly. |
| Project Structure mandate | PASS | No new package. All changes live under `apps/web/src/server` (`services`, `db/schema`, `jobs`), `packages/shared/src`, `apps/web/messages`, and tests. |

### Post-Design Re-check

PASS. Phase 1 design adds zero constitution violation. The unification (one data-source key covers both channels, the `channel` marker carries the per-turn origin, the Bot Session remains a thin wrapper) strengthens P3 (Portable AI Memory) and P5 (Permissions First-Class) by removing a parallel Feishu-only history surface. No anti-pattern (broken navigation, parallel feature entries, vendor lock, second-class AI content) is introduced.

### Public Content Delivery gate

N/A. The feature does not change anonymously readable published page bodies, public metadata, or public navigation. Raw Conversation pages are authenticated Raw-space resources, never part of the public/ISR document body.

Gate result: **PASS — no violations, no justifications required.**

## Project Structure

### Documentation (this feature)

```text
specs/025-feishu-bot-conversation-capture/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── api-delta.md     # Phase 1 output
│   └── ui-contract.md   # Phase 1 output
└── tasks.md             # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── src/server/
│   ├── db/schema/{index.ts,enums.ts}        # optionally widen channel-aware capture status (no schema migration needed; additive metadata via existing source_metadata)
│   ├── services/
│   │   ├── content-data-sources.ts          # register new `ai-conversations` key; back-compat alias reads from legacy `wiki-ai-conversations` row
│   │   ├── ai-question.ts                   # unchanged; createWikiQuestion stays the single entry point, channel inferred downstream
│   │   ├── raw-conversations.ts             # stamp channel on capture; thread it through the pointer
│   │   ├── feishu-delegation.ts             # unchanged at the entry; the `feishuSessionId` requestMetadata tag keeps multi-turn reconstruction working
│   │   └── feishu-sessions.ts               # unchanged; verify turn-isolation invariant still holds after capture
│   ├── jobs/
│   │   └── raw-conversation-capture.ts      # carry the capturing user/channel through audit metadata
│   ├── api/
│   │   └── settings/content-data-sources/   # rename source label in v1 contract
│   └── (existing services untouched)
├── src/i18n/keys.ts                        # `contentDataSources.wikiAiConversations.label/description` -> `aiConversations.*`
├── messages/{en.json,zh.json}              # rename `dataSources.content.wikiAiConversations` → `dataSources.content.aiConversations`
└── src/components/admin/ContentDataSourcesPanel.tsx  # read renamed i18n key; description now mentions every bot channel
packages/
├── shared/src/
│   ├── content-data-sources.ts             # new `AI_CONVERSATIONS_SOURCE_KEY` (canonical) with back-compat alias from old key
│   └── ai.ts                               # add `channel` field to `rawConversationSourceMetadataSchema` and `RawConversationPointer`; new `wikiAiChannelSchema` enum
└── shared/test/                            # optional unit tests for shared schemas
apps/web/src/server/services/
├── raw-conversations.feishu.test.ts        # capture + channel inference tests (NEW)
└── content-data-sources.rename.test.ts     # back-compat alias tests (NEW)
apps/web/src/server/jobs/
└── raw-conversation-capture.feishu.test.ts # Feishu-origin capture + audit tests (NEW)
```

**Structure Decision**: Keep all server logic in `apps/web/src/server`, alongside the services from 004/019/023 it reuses. Shared schemas live in `packages/shared`. No new package, image, or persistent dependency is introduced. The `Test double` for the Feishu transport is reused from 019.

## Design Decisions

### D1 — One Data Source key, one admin label, with back-compat alias

The 023 pipeline already keys every captured `wiki_question` action off `WIKI_AI_CONVERSATIONS_SOURCE_KEY` (`packages/shared/src/content-data-sources.ts:8`). The user's "all bots share the same AI core" principle implies renaming the user-facing concept from "Wiki AI Conversations" to "AI Conversations" without changing the captured behavior. To preserve stored state on every existing deployment:

- Add a new canonical key `AI_CONVERSATIONS_SOURCE_KEY = 'ai-conversations'` in `packages/shared/src/content-data-sources.ts`.
- Treat the old key as a legacy alias: `content-data-sources.ts` keeps reading from `'wiki-ai-conversations'` if no `'ai-conversations'` row exists yet, and writes go to the new key.
- One-shot seed migration: on first startup after the deploy, if the legacy row exists but the new one does not, copy `enabled` + `config` from the legacy row to the new key, mark the legacy row hidden behind a `legacy_alias_for='ai-conversations'` flag (or simply retire it from the registered list), and continue using the new key going forward.
- The i18n label in `apps/web/messages/{en,zh}.json` renames `dataSources.content.wikiAiConversations` to `dataSources.content.aiConversations` with description text updated to mention every bot channel.
- The Feishu delegation service does not change its call into `createWikiQuestion`; the channel marker on the captured Raw page is inferred by the capture worker (see D2), so the runtime hot path stays identical.

`isDataSourceEnabled` reads from the new key with a fallback to the legacy alias for the duration of the deployment window. This is a no-risk in-place state migration: every existing Admin keeps seeing the same enable/disable state for the same underlying switch.

### D2 — `channel` marker on the Raw Conversation page

Add a stable, optional `channel` field to:

1. `rawConversationSourceMetadataSchema` in `packages/shared/src/ai.ts` — `wikiAiChannelSchema = z.enum(['wiki-ai', 'feishu'])` with `channel: wikiAiChannelSchema.optional()`. Default-absent (legacy captures keep their existing payload). Renderer tolerates absence.
2. `RawConversationPointer` in the same file — surface the channel so AI Chat History, search result previews, and admin-only views can show where the conversation came from.

Capture inference rule (in `apps/web/src/server/services/raw-conversations.ts::captureWikiQuestion`): when constructing the per-revision `source_metadata`, read the underlying action's `requestMetadata.origin` (already populated to `'feishu'` by `feishu-delegation.ts:103` and `web` by the web chat side pane). Map:

- `'feishu'` → `channel='feishu'`
- any other (including absent legacy) → `channel='wiki-ai'`

This is a typed, deterministic inference from existing fields; it does not require schema migrations, does not store any raw text, and does not change rendered content. Admin-only surfaces (the `dataSources.content.aiConversations` panel under Content, the `RawConversationPointer.channel` on AI Chat History detail) display this marker; the reader layout itself is unchanged.

### D3 — Bot Session remains a thin Feishu-specific wrapper

No schema change to `feishuBotSessions`. The table already holds only:

- `binding_id` (FK → `feishuBindings.id`)
- `chat_id`
- `ai_action_id` (FK → `aiActions.id`, nullable so future turns can swap it)
- `state` (`active` | `reset` | `expired`)
- `last_activity_at`
- `expires_at`

No question, answer, citations, or status field is stored on the row. The conversation timeline always comes from the `aiActions` row via `attachActionToSession`, and that row's Raw Conversation page now carries `channel='feishu'`. This spec formalizes the existing shape as binding: any future Bot Session schema change that adds question/answer columns is explicitly out of scope.

The session-window logic in `feishu-sessions.ts` (multi-turn continuity via `requestMetadata.feishuSessionId`) continues to work: each turn becomes its own `ai_action` and its own Raw page; the Bot Session tracks the latest action id and the activity window; history reconstruction reads back through the `feishuSessionId` tag. The capture worker only stores a channel marker per turn, so multi-turn semantics are unchanged.

### D4 — Audit channel carries through capture

Each capture commit must record the underlying bot user's actor + `origin='feishu'` (vs `origin='web'` for web captures). The capture worker (`apps/web/src/server/jobs/raw-conversation-capture.ts`) is the one place that already invokes audit, so we thread the channel through:

- read `action.requestMetadata.origin`
- if `'feishu'`, set `auditEntry.origin = 'feishu'`; else `'web'`
- the `auditOriginEnum` already has both values per `apps/web/src/server/db/schema/enums.ts:309`

The audit entry still excludes the raw question, answer, and credentials per 019 FR-027.

### D5 — Per-turn Raw page (no conversation aggregation across turns)

The Bot Session can span multiple turns inside the configured session window. Spec 023 captures one Raw page per `wiki_question` action. We follow 023 strictly here: each Feishu turn is one captured Raw page, with `channel='feishu'` and the same `feishuSessionId` available via the underlying action's `requestMetadata` so a future view-layer grouping can group same-session turns if the product wants to. Aggregation is a UI concern, not a capture concern; this keeps the data model simple and matches the existing per-action capture semantics. The `RawConversationPointer` includes the underlying `actionId` so any grouping UI can pivot on it.

### D6 — Searchability comes for free; we only need permission projection verification

The existing Raw search coordinator (017 + 013) and the semantic search path (022 + 023) already accept any Raw-space page whose `raw_conversation_*` columns indicate it is captured. Because Feishu turns now produce Raw Conversation pages exactly like web turns, they are discoverable via the same code paths. The search integration test must prove:

- keyword search by a phrase that appears only in a captured Feishu turn returns the corresponding Raw page
- semantic search by a related meaning returns the same Raw page
- a user without Raw read permission sees zero results, counts, or excerpts

These tests guard the user's primary success criterion: "the conversation search should work after that."

### D7 — Bot Session termination still terminates the underlying action

019 FR-028 already says: "On unbinding, revocation, or user deactivation, the system MUST immediately expire active bot sessions and stop future personal notifications." For termination on unbind, the spec extends this to: when a Feishu binding is unbound/revoked, we mark any active `feishuBotSessions` row as `'expired'` (existing semantics) AND mark any `aiAction` in `requestMetadata.feishuSessionId` belonging to that binding with `cancelRequested=true` for any unstarted action, while leaving already-published `wiki_question` answers intact for the existing Raw page (the Raw page is preserved under retention; the user's access to it follows Raw read permission at read-time, exactly like a web capture).

## Migration / Backfill

| Step | Description |
|---|---|
| 1 | Add `AI_CONVERSATIONS_SOURCE_KEY = 'ai-conversations'` to `packages/shared/src/content-data-sources.ts`. Treat old key as legacy alias during the `isDataSourceEnabled` lookup. |
| 2 | On first read after deploy, if the new-key row is missing but the legacy row exists, lazily create the new-key row with the legacy `enabled` + `config`. The legacy row is left in place but excluded from admin UI list (it appears as a hidden alias). |
| 3 | Update seed in `apps/web/src/server/seed/index.ts` to also insert the new-key row. |
| 4 | Update i18n key `dataSources.content.wikiAiConversations` → `dataSources.content.aiConversations` in both `apps/web/messages/en.json` and `apps/web/messages/zh.json`. |
| 5 | Schema: add `wikiAiChannelSchema` to `packages/shared/src/ai.ts` and the optional `channel` field to `rawConversationSourceMetadataSchema` and `RawConversationPointer`. Capture worker stamps `channel` per D2. No Drizzle migration required (additive metadata on existing JSON column). |
| 6 | Audit thread: `raw-conversation-capture.ts` carries the origin through to the audit entry. |

No raw content backfill is required. No legacy Feishu Bot Session rows need rewrites.

## Complexity Tracking

> No constitution violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

## Out of Scope (Reaffirmation from Spec)

- Any new bot channel beyond Feishu; future channels plug into the same pipeline, but their transports are not designed here.
- Migration of pre-existing Wiki AI or Feishu captures into a different shape.
- Changing Raw retention, append-only rules, or hard-delete semantics for Raw evidence.
- Per-channel capture-health dashboards or Feishu-specific search/presentation surfaces.
- Changes to Wiki AI provider ranking, retrieval, or permission semantics (those remain governed by 004/013/017/019/022).
- Modifying Feishu notification fan-out (019 User Story 3) or binding (019 User Story 1).
- Changing Feishu rate-limit or session-window defaults.
