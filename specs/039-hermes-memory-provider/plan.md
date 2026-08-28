# Implementation Plan: Generic Agent Memory Backend (Hermes client)

**Branch**: `039-hermes-memory-provider` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-hermes-memory-provider/spec.md`

## Summary

Deliver `next-wiki` as an independently installable Agent Memory Provider. A
published Python package discovers through Hermes's memory-provider entry point,
uses the normal `hermes memory setup` secret flow, recalls and stores memory
through a narrow versioned Wiki REST contract, and supplies safe status,
diagnostic, and bootstrap commands.

The Wiki will add an enforceable Memory Destination boundary: every dedicated
memory-provider API key is bound to exactly one owner-managed destination, and all recall,
save, evidence-capture, and forget operations derive that destination from the
authenticated key. This prevents client configuration or page paths from becoming
the authorization boundary. Durable text is written as immutable, restricted Raw
entries through the shared Raw writer and page/revision content backend;
published entries participate in the common reconciliation/indexing and audit
pipelines. Supporting tables only bind keys, identify records, connect evidence,
and make retries idempotent. The first-run optional help suite gains a managed,
  collision-safe Agent Memory guide.

The public contract is intentionally client-neutral. Hermes is the first
adapter; later Mino, Claude Code, or other agents can use the same routes and
Raw/index projection by selecting their own immutable `agent_identity` in key
metadata.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ for the Wiki; Python 3.11+
for the separately distributed Hermes provider, matching the Hermes versions
covered by compatibility tests.

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, Zod,
PostgreSQL 16, pg-boss, existing public-API audit/OpenAPI infrastructure; Python
standard packaging plus a bounded HTTP client and pytest for the provider.

**Storage**: PostgreSQL 16. Raw-space page and page-revision source content
remains canonical and is written through the shared Raw/content-store path;
published records are handed to common index reconciliation. New relational
metadata holds Memory Destinations, API-key bindings, logical records, evidence
links, and idempotency state. No transcript or memory body is duplicated in an
integration-specific table.

**Testing**: Vitest unit/integration and route tests, Playwright onboarding/API
key tests, pytest provider tests against HTTP fixtures and Hermes contract
fixtures, Docker Compose end-to-end validation, and compatibility CI against a
pinned minimum and current Hermes release.

**Target Platform**: Docker Compose/Kubernetes-hosted next-wiki and any machine
or container running a supported Hermes installation. The provider communicates
over HTTPS for remote Wiki deployments; documented local development endpoints
remain supported.

**Project Type**: Existing TypeScript web-service monorepo plus a published,
standalone Python integration package.

**Performance Goals**: Local lexical recall returns up to the configured bound
of records within 2 seconds at p95 under normal deployment load; setup/doctor
connection checks time out within 5 seconds; post-turn capture never blocks the
completed Hermes turn.

**Constraints**: `is_available()` performs no network I/O; API secrets must
never be accepted as positional arguments or shown in logs/status/errors; every
Memory Destination is server-enforced; automatic capture is opt-in; required
pre-compression checkpoints are durable and idempotent; no Wiki AI provider or
additional stateful service is required.

**Scale/Scope**: One external Hermes provider slug (`next-wiki`), one logical
destination per dedicated API key, bounded recall and capture payloads, lexical
recall as the AI-independent baseline over the namespace projection, immutable
Raw-space storage and common index reconciliation (Raw/LLM Wiki mode is a
prerequisite), and one public setup integration page. Historical imports, memory
federation, arbitrary multi-provider UI, and generic third-party provider
management remain out of scope.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle / gate | Design response | Status |
|---|---|---|
| P1 — simple deployment | The provider is an optional, external Python package. The Wiki adds only PostgreSQL tables, routes, and existing pg-boss work; it introduces no container, cache, queue, model provider, or required service. | Pass |
| P2 — AI-native, vendor-neutral | Hermes is an external reasoning client, not a required Wiki model provider. The integration uses a provider-specific adapter and standard REST rather than a proprietary Wiki-wide dependency. Wiki remains usable without Hermes and Hermes memory works without Wiki AI configuration. | Pass |
| P3 — portable, grounded memory | Restricted immutable Raw entries/revisions hold canonical memory and original evidence. Memory metadata carries source revision links; the common recall/index projection is derived and rebuildable. No generated memory is public by default. | Pass |
| P5 — permissions first | A dedicated API key has explicit memory scopes and a server-side single destination binding. The REST service derives namespace from authentication, re-checks ownership/state/scopes on every request, and never trusts a provider-supplied profile or path. | Pass |
| P7 — asynchronous heavy work | Normal post-turn capture creates a pg-boss job and returns immediately. The Python provider queues it in a daemon worker. A required compression checkpoint submits then polls the durable job state; it fails closed if it cannot finish. Workers call `runWithoutDataCache`. | Pass |
| P8 — source content and reversible changes | Memory/evidence content is appended through the shared Raw/page-revision lifecycle and remains immutable. Forget changes only the Agent Memory projection state while retaining the Raw source and audit metadata; capture retries are idempotent by destination and digest. | Pass |
| P9 — open standards | Hermes calls documented REST + JSON endpoints protected by Bearer API keys; routes use shared Zod schemas and appear in OpenAPI. MCP remains the general AI-client adapter, not this lifecycle-specific transport. | Pass |
| P10 — explicit registration | API routes, permission scopes, job handler, audit origin, provider entry point, setup-page definitions, and publish workflow are explicit registries/files. No Wiki-side filesystem plugin discovery is added. | Pass |
| P12 — public content delivery | Only the managed integration page and generated welcome/help links change public content. They use normal published-page cache representation and targeted invalidation; credentials, status, destinations, evidence, and controls stay authenticated. | Pass |

### Source of Truth, Provenance, and Publication Boundary

- A Memory Record's content is an immutable restricted Raw page revision. An
  Evidence Record's original conversation text is likewise an immutable Raw
  entry. The shared Raw writer stores the body verbatim, assigns the Agent Memory
  system category/source metadata, publishes once, and invokes common index
  reconciliation. Raw-space availability (currently LLM Wiki writing mode) is
  an explicit prerequisite and is surfaced by diagnostics.
- `agent_memory_records` is a locator/provenance projection only. It never
  stores a second copy of content. `agent_memory_evidence_links` records which
  evidence revisions support an explicit memory, while page/revision history
  remains the content source of truth.
- Every request uses the authenticated API key's destination binding and normal
  page/write rules. Captured evidence is machine-attributed with safe provider,
  session-digest, and idempotency metadata; raw prompt/tool-result bodies never
  enter audit metadata.
- Explicit save is an intentional restricted append. Automatic capture is an
  explicit setup choice. Both flows publish an immutable Raw revision, never
  alter an existing body, and never make it anonymously readable. Forget only
  hides the logical record from provider recall; Raw retention remains governed by
  the Raw space and ordinary owner/admin controls.
- Namespace-filtered lexical recall is a derived, rebuildable projection over
  eligible current revisions for both explicit memories and durable evidence.
  It does not require embeddings or an LLM. If a
  future semantic adapter is used, it must receive the same allowed-record set
  and return citations only after the service re-checks the binding.

## Project Structure

### Documentation (this feature)

```text
specs/039-hermes-memory-provider/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── hermes-memory-rest-api.md (client-neutral Agent Memory contract)
└── tasks.md                         # created by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/api/v1/memory/
│   ├── _shared.ts
│   ├── connection/route.ts
│   ├── diagnostics/route.ts
│   ├── recall/route.ts
│   ├── records/route.ts
│   ├── records/[memoryId]/route.ts
│   ├── evidence/route.ts
│   └── evidence/[captureId]/route.ts
├── src/components/user-center/
│   └── ApiKeyCreateDialog.tsx        # Memory-provider key/destination option
├── src/server/
│   ├── api/                          # Zod/OpenAPI/error/audit integration
│   ├── db/schema/                    # Drizzle source schemas and generated migration
│   ├── jobs/                         # registered capture job handler
│   ├── permissions/                  # memory scopes and destination checks
│   └── services/
│       ├── agent-memory.ts
│       ├── agent-memory-recall.ts
│       └── setup-sample-page-*.ts
└── test and e2e/                     # service, route, permission, onboarding coverage

packages/
├── shared/src/                       # scopes, public contracts, audit schemas
├── mcp-server/                       # docs cross-link only; no Hermes runtime code
└── hermes-memory-provider/ (Hermes client adapter)
    ├── pyproject.toml
    ├── README.md
    ├── src/next_wiki_memory/
    │   ├── __init__.py               # MemoryProvider + register()
    │   ├── api_client.py
    │   ├── config.py
    │   ├── config_schema.py           # Hermes Desktop schema
    │   ├── cli.py                     # hermes next-wiki commands
    │   └── redaction.py
    └── tests/

.github/workflows/
└── publish-hermes-memory-provider.yml
```

**Structure Decision**: Keep all Wiki data, authorization, audit, and REST
behavior in the existing app/service/shared-contract layers. Publish the Hermes
adapter as a Python package inside `packages/` so it has Hermes-native discovery
and lifecycle semantics without embedding a Python runtime in the Wiki Docker
image or broadening the existing Node MCP server.

## Design and Delivery Sequence

1. **Freeze public and provider contracts first**
   - Add shared memory-scope, destination, record, evidence, diagnostic, and
     error schemas; register REST/OpenAPI metadata before route implementation.
   - Define a Python wheel with the `hermes_agent.memory_providers` entry point,
     a package-level `register(ctx)`, supported Hermes compatibility matrix, and
     a separately invokable safe bootstrap command.

2. **Create the enforceable server boundary**
   - Extend API-key creation with a feature-level Memory provider preset and a
     transaction that creates or deliberately reuses a Memory Destination, then
     binds the newly minted key to it. The key receives only `memory.read`,
     `memory.write`, and/or `memory.delete` as selected; generic page scopes do
     not authorize provider routes.
   - Add Drizzle schema definitions for namespaces, bindings, records, evidence
     links, scope/audit enums, and indexes. Generate the migration exclusively
     with `pnpm db:generate`, then rerun it to confirm no pending schema change.
     Because this branch is not merged yet, keep its migration history clean by
     replacing the intermediate Hermes migrations with one 0021 migration from
     the `origin/main` 0020 snapshot; the migration creates only generic
     `agent_memory_*` objects.

3. **Implement memory service and narrow REST surface**
   - Resolve the destination solely from the authenticated key. Reuse the
     shared Raw-entry writer, page/revision content store, category/provenance,
     and index-reconciliation services behind an `agent-memory` adapter; do not
     expose generic page CRUD to providers. The adapter appends immutable Raw
     records and changes only the agent-memory projection on forget.
   - Add AI-independent bounded lexical recall over only bound record IDs,
     explicit save/upsert, source-evidence links, reversible forget, and safe
     connection/diagnostic results. Extend audit origin and error mapping without
     recording content, profile names, queries, or credentials.

4. **Implement durable capture lifecycle**
   - Accept normalized evidence with a bounded idempotency digest. Queue normal
     capture to a registered pg-boss handler and expose status polling.
   - For an enabled Hermes v2 pre-compression checkpoint, submit/poll until the
     exact durable evidence revision exists or fail closed. Use
     `runWithoutDataCache` in the worker and test retries/overlap transactionally.

5. **Implement and test the Hermes package**
   - Make `is_available` local-only; persist only non-secret configuration under
     the active `hermes_home`; let Hermes own the secret `.env` field.
   - Add bounded prefetch, opt-in non-blocking sync, session switch/end flush,
     capability-gated checkpoint, and uniquely named search/save/forget tools.
     Provide `hermes next-wiki status|check` plus a standalone
     `next-wiki-hermes-memory init --dry-run` bootstrap path for users before
     the provider becomes active.

6. **Make configuration discoverable**
   - Add the marker-owned `integrations/hermes` sample page under the virtual
     `integrations` folder, linked from generated welcome and main-features
     content. Migrate the old `help/agent-memory` marker page without
     duplicating it, while preserving collision/idempotency behavior in the
     default wiki space; resolve that space before collision lookup so an
     unrelated Raw or Generated page at the same path cannot block the guide.
   - Keep the package README as the single canonical Hermes integration guide;
     link it from the root README, deployment documentation, existing MCP
     documentation, and the first-run Wiki page. Add a Wiki-space-only Admin →
     Spaces icon action that re-runs this idempotent initialization after setup
     has closed. Cover key creation,
     local/remote addresses, transport, containers, activation, capture,
     checkpoint caveats, rotation, backup, revocation, and diagnosis without
     live secrets.

7. **Verify, release, and document operations**
   - Add unit, integration, route/OpenAPI, E2E, pytest, and Docker Compose
     coverage. Add a dedicated release workflow that builds/tests the wheel and
     publishes it using an explicit `hermes-memory-provider-v*` release tag.
   - Test the oldest supported and current Hermes releases in compatibility CI;
     record the upstream release/commit fixtures so API drift is detectable.

## Complexity Tracking

No constitutional violation requires an exception. The new Python package is an
optional external integration rather than a required deployment component; the
new PostgreSQL metadata is necessary to enforce an authorization boundary that
the existing whole-space API-key model cannot express.
