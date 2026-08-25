# Implementation Plan: Governed Web Research for Wiki AI

**Branch**: 036-web-research | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from specs/036-web-research/spec.md

## Summary

Add an explicit wiki_first_web research mode to the signed-in Wiki AI chat. It
remains Wiki-first and exposes a bounded, read-only web tool profile only when
the user is entitled, confirms the egress disclosure, and an administrator has
enabled the service. The first connector is Tavily, behind a provider-neutral
WebResearchConnector contract rather than an LLM or MCP provider. web_search
returns policy-filtered candidates; web_open retrieves only action-scoped opaque
candidate identifiers.

External evidence is transient and encrypted, expiring within 24 hours unless a
user explicitly captures it into the existing Raw original-source workflow.
Answers use a discriminated citation contract so external links remain visibly
different from immutable Wiki revision citations. Connection tests and evidence
capture use bounded synchronous routes with terminal AI-action audit records.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+ (Node 24 Docker image)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, Zod,
pg-boss, existing AI tool loop; native fetch for Tavily HTTP (no Tavily SDK and
no new always-on service)

**Storage**: PostgreSQL 16; extend singleton AI settings and entitlements; add
expiring encrypted web-source records plus privacy-safe research attempts; reuse
Raw original source pages for explicitly preserved evidence

**Testing**: Vitest unit/integration fixtures, route and worker tests,
Playwright E2E; no paid or live Tavily request in automated tests

**Target Platform**: Docker Compose/Kubernetes self-hosted Next.js app and
pg-boss worker, modern authenticated browser

**Project Type**: Full-stack web application with background jobs

**Performance Goals**: At least 95% of permitted test questions complete with an
answer or recoverable outcome within 45 seconds; default budget is at most two
searches, five candidates per search, three opened sources, and a 10-second
connector timeout per call

**Constraints**: No egress without explicit mode, entitlement, active service,
and request-time policy check; do not send Wiki bodies, secrets, identity,
cookies, or unrelated conversation content to the connector; web tools are
read-only and cannot accept arbitrary URLs; unpreserved bodies expire in 24h;
keys never reach browser, events, or ordinary logs

**Scale/Scope**: One deployment-level connector in v1; signed-in chat only; two
built-in tools, one independent tool category, transient evidence, and
admin/user chat controls. Public API, MCP, bots, scheduled jobs, crawling, and
automatic publication are out of scope.

## Constitution Check

### Pre-research gate

| Principle / gate | Design response | Status |
|---|---|---|
| P1 — simple deployment | Tavily is an optional outbound connector configured in the existing application. It adds no container, queue, cache, SDK, or stateful service. Disabled or unconfigured deployments remain fully usable. | Pass |
| P2 — AI-native, vendor-neutral | A WebResearchConnector registry decouples Tavily from model adapters and durable evidence. Existing chat/embedding/image providers remain unchanged; a future hosted-search adapter is additive. | Pass |
| P3 — portable, grounded memory | Search output is transient. Only a deliberate user capture writes a Raw original source with URL, title, retrieval time, provider identity, and content hash; generated edits stay separate and governed. | Pass |
| P5 — permissions first | Creation, worker execution, source opening, capture, and reader access each re-check actor/session permission, entitlement, global enablement, action ownership, and source policy. API keys, anonymous users, bots, MCP, and jobs cannot request web research in v1. | Pass |
| P6 — UI consistency | Chat mode, disclosure, source chips, and admin panels use existing UI primitives, i18n keys, tokens, and header/tab patterns. | Pass |
| P7 — async heavy operations | Search/open runs in the existing queued AI question job. Connection tests and evidence capture are bounded synchronous routes; each retains a terminal action audit record. Workers use runWithoutDataCache. | Pass |
| P10 — explicit registries | Connector capabilities, tool definitions/executors, configuration, permission checks, action handlers, output events, cleanup, and tests are registered explicitly. No import-time discovery. | Pass |
| P11 — URL state | Research mode is persisted in conversation metadata and the chat URL state so refresh and shared/returned navigation restore it. | Pass |

### Public delivery gate

Not applicable. This feature creates no anonymously readable page, modifies no
reader representation, and performs no ISR/static generation. Preserved Raw
evidence stays behind the existing authenticated permission model; no cache
invalidation path is added.

### AI growth and provenance gate

The source of truth for an unpreserved source is an encrypted, expiring
ai_web_sources record; it is never indexed or treated as Wiki knowledge. The
source of truth after capture is a normal Raw original-source page and its
revision. WebCitation carries the canonical address, title, provider, retrieval
time, and local content hash; it does not imply factual verification. The
capture worker re-checks access and creates no Wiki page/edit/publication. Any
later synthesis or page change follows the existing proposal/review flow and
must reference the captured Raw source as provenance. All derived search or
retrieval state is rebuildable and may be deleted without changing the Raw
source.

### Post-design re-check

The Phase 1 data model and contracts retain all gates above. No constitutional
exception or complexity waiver is required.

## Project Structure

### Documentation (this feature)

~~~text
specs/036-web-research/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tool-and-citation-contract.md
│   ├── ui-contract.md
│   └── web-research-api.md
└── checklists/
    └── requirements.md
~~~

### Source Code (repository root)

~~~text
packages/shared/src/
├── ai.ts                              # question/research mode and citations
└── ai-tools.ts                        # shared tool-category contracts

apps/web/
├── app/
│   ├── api/ai/
│   │   ├── questions/route.ts
│   │   ├── web-research/
│   │   │   ├── settings/route.ts
│   │   │   └── connection-tests/route.ts
│   │   └── web-research/sources/[sourceId]/capture/route.ts
│   └── (admin)/admin/ai/research/page.tsx
├── src/
│   ├── components/ai/                 # chat mode, citations, source capture
│   ├── components/admin/ai/            # connector and policy controls
│   ├── i18n/                           # localized UI keys/messages
│   └── server/
│       ├── crypto/ai-encryption.ts
│       ├── db/schema/                  # Drizzle schema and generated migration
│       ├── jobs/                       # question/test/capture action handlers
│       ├── services/                   # actions, entitlement, tools, Raw writer
│       └── web-research/               # connector registry, Tavily, policy
└── public/openapi.json                 # regenerated only through project script

e2e/
└── admin-ai-web-research.spec.ts
~~~

**Structure Decision**: Keep the feature in the existing Next.js application
and shared contract package. A small, server-only web-research boundary owns
connector transport and source-policy validation; existing AI actions, tool
runtime, Raw source storage, and UI shells own lifecycle concerns. This avoids
an external MCP bridge or a second provider runtime.

## Design and Delivery Sequence

1. **Shared contracts and persistence**
   - Add ResearchMode without changing the existing full/retrieval question
     strategy enum.
   - Add the web tool category, WebResearchConnector capabilities,
     discriminated WikiCitation | WebCitation, and backwards-compatible parsing
     for persisted citations that lack kind.
   - Add encrypted connector settings, a per-user webResearchEnabled
     entitlement, expiring ai_web_sources, privacy-safe ai_web_research_attempts,
     and AI-action features. Edit Drizzle schemas first, run pnpm db:generate,
     then rerun it to prove no schema changes remain. Never hand-author a
     migration.

2. **Configuration, connector, and boundary controls**
   - Implement static tavily connector registration with explicit search,
     extract, usage accounting, error mapping, timeouts, and redacted outbound
     auditing. Use fixed request parameters and provider-independent results.
   - Resolve active service, actor entitlement, domain allow/deny, budget,
     cancellation, and global switch at each external call; a worker-start
     snapshot alone is insufficient.
   - Implement admin settings and synchronous connection-test actions. Credentials
     are encrypted and write-only. Update OpenAPI source schemas and regenerate
     public/openapi.json.

3. **Read-only AI tool profile and citations**
   - Register web_search and web_open as next-wiki built-in tools, not external
     MCP tools. web_search derives a minimal query from the original user
     question; web_open takes only an action-scoped opaque sourceId.
   - In wiki_first_web, allow Wiki read tools plus these web tools; exclude
     mutation, draft, publish, metadata, and evidence-creation tools. Keep the
     normal profile for Wiki-only sessions.
   - Store bounded encrypted bodies outside action events. Extend events,
     citation merging, prompts, session reconstruction, Markdown/Feishu
     consumers, link rendering, and chat source display for both variants.

4. **Capture and user/admin experience**
   - Add an admin AI Research panel/tab and user entitlement control.
   - Add a URL-restorable mode selector and first-use egress notice; do not
     submit until the user confirms. Avoid leaking configuration details.
   - Add synchronous source capture. A trusted Raw writer creates
     external-fetch original evidence and associates it with the source row. It
     is idempotent, never automatic, and never changes/publishes a Wiki page.

5. **Lifecycle, regression, and operational validation**
   - Delete expired unpreserved bodies and metadata while leaving captured Raw
     evidence intact. Keep only privacy-safe attempt summaries.
   - Cover connector failures, policy TOCTOU, cancellation, citations,
     retention, capture permission, UI, OpenAPI, and regressions. Run lint,
     typecheck, unit/integration tests, E2E, and Docker Compose build.

## Complexity Tracking

No constitution violations require justification.
