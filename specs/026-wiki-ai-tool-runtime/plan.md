# Implementation Plan: Wiki AI Tool Runtime

**Branch**: `026-wiki-ai-tool-runtime` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-wiki-ai-tool-runtime/spec.md`

## Summary

Upgrade the Wiki AI chat surface from question answering to a governed tool-using assistant. The first phase exposes the instance's own wiki-management tools to Wiki AI through an MCP-compatible internal tool provider, lets the model call tools iteratively during a chat turn, streams tool progress into the chat UI, and turns mutating tool calls into either page drafts/diffs or reviewable non-page change proposals according to server-enforced policy.

The implementation stays inside the existing web app and service layer. It adds a registered tool-provider catalog, tool runtime records tied to canonical `wiki_question` `ai_actions`, a bounded tool-loop worker path selected by action input, proposal records for tag/metadata/batch-style mutations, and a dedicated Raw category for tool evidence when tool output becomes source material for durable knowledge. The web Wiki AI pane and bot integrations such as Feishu must both call this same tool-chat core and pass bounded recent conversation context, so follow-up instructions like "write the above into a page" can create a draft/proposal instead of falling back to ordinary Q&A. Search, Wiki AI RAG, and bot/tool retrieval share the minimum relevance threshold from Search Settings; Wiki evidence is preferred, while ordinary informational answers may fall back to general model knowledge without fabricated citations. External MCP providers are not enabled in this phase, but provider identity, risk, retention, review, and evidence contracts are modeled now so later providers use the same policy surface.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Docker image tracks Node 24); React 19.2 and Next.js 16 App Router.

**Primary Dependencies**: Existing Next.js route handlers, Drizzle ORM, pg-boss, Zod schemas in `packages/shared`, existing AI action/event lifecycle, existing provider/model assignment services, existing page/content services, existing tag services, existing Raw category/Raw entry services, existing Feishu bot session/delegation services, existing MCP server tool schemas as the interoperability reference. Add no new runtime service; likely add no new npm dependency.

**Storage**: PostgreSQL 16 with pgvector. New schema is required for tool provider settings, tool calls, change proposals, proposal items, proposal decisions, and tool-evidence links. Migrations MUST be generated from Drizzle schema changes with `pnpm db:generate`, never hand-authored.

**Testing**: Vitest unit/integration tests for shared schemas, tool policy, tool runtime, permission projection, proposal apply/reject, Raw evidence creation, and API routes. React component tests for Admin Tools and chat tool-call rendering. Playwright E2E for Admin Tools setup, chat tool loop, proposal review, public-content non-change before approval, and permission redaction.

**Target Platform**: Existing full-stack web application running via Docker Compose / Kubernetes with the existing app + worker image and PostgreSQL state.

**Project Type**: Full-stack web-service monorepo using pnpm workspaces + Turborepo.

**Performance Goals**: A chat turn with up to 100 tool calls should stream visible tool state changes within 2 seconds under normal conditions. Tool-call command/status event payloads stay bounded for chat history. Read-only tool calls should preserve existing page/search latency envelopes. Mutating operations that may exceed 500ms run through the existing async AI/action/job lifecycle.

**Constraints**: No new default service, queue backend, object store, external MCP runtime, or provider-specific SDK. Tool calls run under the initiating user's permission context. Durable mutations must be audited, reviewable when policy requires it, and reversible. Full arbitrary tool results are not stored in Conversation records by default. Tool output used as durable source material must be captured or referenced as Raw evidence. Public wiki content changes only through the normal governed apply/publish flow and existing static/ISR invalidation. External MCP registration and execution are out of scope.

**Scale/Scope**: Built-in wiki provider only; tool categories for read/search, page drafting, page properties/metadata/tags, batch-safe organization, and Raw evidence capture. New Admin AI Tools page/tab; new chat tool timeline display; new proposal review surface for non-page changes; API/OpenAPI deltas for tool settings, action submission, tool events, proposals, and evidence links; MCP package may export or share tool metadata but does not need an external self-call.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source: `.specify/memory/constitution.md` v2.3.0 and linked architecture mandates.

| Principle / Mandate | Status | Design compliance |
|---|---|---|
| P1 Simple Deployment | PASS | Reuses PostgreSQL and pg-boss; no Redis, Elasticsearch, external MCP service, or new container is required. |
| P2 AI-Native / Never Vendor-Locked | PASS | Tool calling is routed through provider-agnostic AI model capability checks. No feature hard-codes a vendor SDK; models that cannot call tools degrade to ordinary Q&A. |
| P3 Portable, Self-Growing AI Memory | PASS | Tool output that supports durable knowledge is captured/referenced as Raw evidence; generated changes carry provenance and citations; no ungrounded self-growth path is allowed. |
| P4 Rendering Pipeline | PASS | Tool-call display is chat UI metadata, not a renderer change. Page content still stores source and renders through the existing pipeline. |
| P5 Permissions First-Class | PASS | Tool calls receive a `PermCtx` from the initiating user and re-check permission at execution, proposal display, and proposal apply time. Admin review does not expand the initiator's rights. |
| P6 Style System & UI Consistency | PASS | Admin Tools, proposal review, and chat timeline reuse existing admin/chat/UI primitives; no bespoke style surface. |
| P7 Async-First | PASS | Tool chat runs through `ai_actions`/pg-boss; long or mutating work is not performed synchronously inside request handlers. |
| P8 Version Everything | PASS | Page-content changes use draft/revision/diff. Non-page changes are stored as proposals and application records; deletion remains soft/reversible. |
| P9 Open Standards | PASS | REST + OpenAPI remains the public UI/API contract; MCP-compatible tool names/schemas define interoperability for future providers. |
| P10 Explicit Over Implicit | PASS | Built-in tools are statically registered in one server registry; future provider types are represented explicitly and cannot be auto-discovered or activated in this phase. |
| P11 Native Navigation & Unified Entries | PASS | Admin Tools, proposal detail, and evidence references have canonical routes and URL-restorable state. No duplicate writable tool settings entry. |
| P12 Public Reading Static by Default | PASS | Tool enablement and proposals do not alter anonymous content. Approved public page mutations use existing public-content invalidation. |
| API Architecture | PASS | Route handlers stay thin over shared Zod schemas and services; MCP package remains a client-facing adapter over the same service contracts. |
| AI Knowledge Layer | PASS | Tool evidence is canonical Raw/page revision data; derived indexes and summaries remain rebuildable projections. |
| AI Chat Side Pane | PASS | Chat streams tool-call states and requires review/confirmation boundaries for durable mutations. |
| Search Retrieval Architecture | PASS | Read tools reuse existing search/page services and permission-safe result projection. |
| Frontend Data Flow | PASS | Admin and proposal server state use TanStack Query; chat local display state remains local/stream-driven; filters and proposal tabs use URL query state. |
| Public Content Delivery | PASS | Public content changes only after proposal application/publish and standard revalidation. |

### AI Memory Growth-Loop Gate

PASS. The design defines source-of-truth (`tool_calls`, proposals, page revisions, Raw evidence), provenance/citation relationships, permission re-checks, review/publication boundaries, and rebuildable derived state. Full tool results are excluded from Conversation records unless they become durable source material; when they do, Raw evidence capture is mandatory.

### Post-Design Re-check

PASS. Phase 1 design preserves the same gates: no extra services, no vendor lock, no implicit tool discovery, no direct public mutation, and no ungrounded self-growth. New Drizzle tables are justified because page drafts cannot represent non-page changes such as tag rename/metadata/batch proposals.

## Project Structure

### Documentation (this feature)

```text
specs/026-wiki-ai-tool-runtime/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-delta.md
│   ├── tool-contract.md
│   └── ui-contract.md
└── tasks.md              # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── (admin)/admin/ai/tools/page.tsx
│   ├── (admin)/admin/ai/tools/proposals/[id]/page.tsx
│   ├── api/ai/questions/route.ts
│   ├── api/ai/actions/[id]/events/route.ts
│   ├── api/ai/tools/{route.ts,providers/route.ts}
│   ├── api/ai/tool-proposals/{route.ts,[id]/route.ts}
│   └── api/ai/tool-proposals/[id]/{approve,reject,apply}/route.ts
├── src/server/
│   ├── db/schema/{enums.ts,index.ts}
│   ├── services/
│   │   ├── ai-tool-registry.ts
│   │   ├── ai-tool-runtime.ts
│   │   ├── ai-tool-policy.ts
│   │   ├── ai-tool-proposals.ts
│   │   ├── ai-tool-evidence.ts
│   │   ├── ai-question.ts
│   │   ├── ai-actions.ts
│   │   ├── feishu-delegation.ts
│   │   ├── feishu-sessions.ts
│   │   ├── raw-categories.ts
│   │   ├── raw-entries.ts
│   │   ├── public-content.ts
│   │   └── tags.ts
│   ├── jobs/{register.ts,ai-actions.ts}
│   └── api/openapi-schemas.ts
├── src/hooks/{use-ai-chat.ts,use-ai-action.ts}
├── src/components/
│   ├── admin/ai/AiToolsPanel.tsx
│   ├── admin/ai/ToolProposalDetail.tsx
│   ├── chat/ToolCallTimeline.tsx
│   └── chat/ConversationSessionView.tsx
├── messages/{en.json,zh.json}
└── src/i18n/keys.ts

packages/
├── shared/src/{ai-tools.ts,ai.ts,pages.ts,index.ts}
└── mcp-server/src/{server.ts,tools/*,api-client.ts}
```

**Structure Decision**: Keep the runtime inside `apps/web/src/server/services` so tool execution can call the same permission-checked services as web/API/MCP. Add shared Zod schemas in `packages/shared`. Reuse the external `packages/mcp-server` tool names and shapes as the interoperability reference, but do not require the web app to launch or self-call the MCP server.

## Complexity Tracking

> No constitution violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

## Phase 0 -> Phase 1 Outputs

- `research.md` — decisions R1-R10 covering runtime shape, review policy, model capability, evidence retention, and external-provider deferral.
- `data-model.md` — new entities, validation, relationships, and state transitions for providers, tool calls, proposals, and evidence links.
- `contracts/api-delta.md` — REST/OpenAPI deltas for tool settings, question submission, events, proposals, and evidence.
- `contracts/tool-contract.md` — built-in tool catalog, categories, command markdown, review parameter, and result/evidence semantics.
- `contracts/ui-contract.md` — Admin Tools, chat timeline, proposal review, and permission-redaction UX contract.
- `quickstart.md` — end-to-end validation scenarios and commands.

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 design: all gates still PASS. The design keeps tool calls explicit and permission-scoped, requires Raw evidence for durable knowledge sourced from tool output, and routes public mutations through review/application paths with normal history and invalidation.
