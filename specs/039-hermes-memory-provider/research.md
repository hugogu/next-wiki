# Research: Hermes Memory Provider

**Feature**: [Hermes Memory Provider](./spec.md)
**Date**: 2026-08-27

## 1. Provider Distribution and Discovery

**Decision**: Publish a standalone Python distribution named
`next-wiki-hermes-memory`, importing `next_wiki_memory`, with the entry point
`hermes_agent.memory_providers: next-wiki = next_wiki_memory:register`. Include
`__init__.py`, `config_schema.py`, `cli.py`, README, and package data in the
wheel. Treat a user plugin directory and a project plugin directory as
development alternatives only.

**Rationale**: Hermes supports pip-installed memory providers without copying
files into its own repository. Its memory-provider discovery gives bundled,
user-directory, project-directory, then package entry points precedence; a
single wheel is the cleanest installation and update story. `config_schema.py`
and `cli.py` must be adjacent to the package entry point for Hermes discovery.

**Alternatives considered**:

- Add a provider under Hermes's `plugins/memory/`: rejected because Hermes
  intentionally closes that tree to new third-party providers.
- Ship only a copyable directory: rejected because it complicates upgrades,
  dependency management, and collision diagnosis.
- Reuse the existing Node MCP package: rejected because it is a stdio adapter
  with no MemoryProvider lifecycle or Hermes setup integration.

**Sources**: [Hermes memory-provider guide](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin), [Hermes plugin guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins).

## 2. Hermes Lifecycle and Compatibility

**Decision**: Implement the required provider contract (`name`, local-only
`is_available`, `initialize`, tool schema/dispatch, config schema, config save,
and `register`) and use `prefetch`, `sync_turn`, `on_session_switch`,
`on_session_end`, `on_pre_compress`, and `shutdown` only where the configured
feature needs them. Feature-detect the version-2 pre-compression checkpoint
contract and document/test a supported Hermes version range instead of inventing
a separate global plugin API version.

**Rationale**: Hermes may provide optional identity, user, workspace, platform,
and session context at initialization. State must use the `hermes_home` supplied
by Hermes and update when a session switches. The current host requires
`is_available` to avoid network calls and expects post-turn sync to be
non-blocking. The strict checkpoint API is additive and not guaranteed by the
first public MemoryProvider release.

**Alternatives considered**:

- Use a fixed `~/.hermes` directory or initialize once per process: rejected
  because profiles and session switches would leak or misroute data.
- Always advertise required compression checkpoints: rejected because older or
  incompatible hosts cannot truthfully provide that guarantee.
- Mirror every built-in memory write by default: rejected because background
  contexts and built-in writes can include material the owner did not opt into
  capturing.

**Sources**: [MemoryProvider abstract base class](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_provider.py), [checkpoint guidance](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin), [Hermes releases](https://github.com/NousResearch/hermes-agent/releases).

## 3. Direct REST Is the Correct Transport

**Decision**: The provider calls a new, narrow `/api/v1/hermes/memory/*` REST
surface directly. It does not spawn, embed, or call `@next-wiki/mcp-server`.

**Rationale**: The existing MCP package is a broad Node stdio adapter for
general AI clients. Hermes memory operations require lifecycle-aware capture,
idempotency, scoped recall, and key-to-destination authorization that generic
page tools cannot enforce. REST is the project's standard external integration
surface and shares Zod, services, permission checks, audit, and OpenAPI.

**Alternatives considered**:

- Generic `/pages`, `/search`, and Raw routes: rejected because their existing
  API scopes and space access are wider than a single memory destination.
- MCP tools: rejected because the provider would need a Node child process and
  still could not obtain destination-scoped authorization.

**Local evidence**: `packages/mcp-server/`, `apps/web/app/api/v1/`, and
`docs/architecture/mandates.md` API Architecture.

## 4. Server-Enforced Memory Destinations

**Decision**: Add `memory.read`, `memory.write`, and `memory.delete` API-key
scopes and bind each Hermes API key to exactly one server-side Memory
Destination. A user who intentionally shares memory provisions another dedicated
key bound to the same destination. Provider requests never accept a destination,
profile, owner, or arbitrary base URL in tool arguments.

**Rationale**: Current API-key scopes authorize broad actions and `spaceAccess`
authorizes an entire Wiki/Raw/Generated space. A `memory/{profile}` path prefix
would only be a convention; a compromised or misconfigured provider could query
outside it. Deriving the destination from the authenticated key makes isolation
enforceable at the service boundary and lets key revocation stop all future
access.

**Alternatives considered**:

- Trust a profile/path sent by the Python client: rejected as unenforceable.
- Give one broad Admin key to all profiles: rejected because it defeats
  least-privilege and reliable revocation.
- Add a new stateful memory service: rejected because it violates the small
  deployment goal and duplicates durable content.

**Local evidence**: `packages/shared/src/api-keys.ts`,
`apps/web/src/server/services/api-keys.ts`,
`apps/web/src/server/permissions/`, and `apps/web/src/server/db/schema/index.ts`.

## 5. Canonical Memory, Evidence, and Recall

**Decision**: Store memory and captured evidence as normal restricted Wiki pages
and revisions in every writing mode. Use lightweight metadata tables only for
namespace binding, logical memory IDs, evidence links, state, and idempotency.
Implement bounded lexical recall over the destination's eligible current
revisions as the baseline; semantic recall is an optional later adapter, never a
requirement for Hermes memory.

**Rationale**: Normal pages and revisions already provide content history,
machine attribution, soft deletion, auditing, and portability. Existing Raw and
Generated spaces are Admin-only LLM Wiki features, so making them the baseline
would break Copilot mode and require Wiki AI setup. The existing semantic search
also depends on enabled embeddings and lacks a namespace filter.

**Alternatives considered**:

- A separate transcript/blob table: rejected because it creates a second-class,
  unversioned knowledge source.
- Raw-only conversation capture: rejected because Raw is not available in every
  writing mode and cannot provide destination isolation alone.
- Require embeddings for recall: rejected because the provider must work when
  Wiki AI is disabled or unavailable.

**Local evidence**: `apps/web/src/server/services/raw-entries.ts`,
`apps/web/src/server/services/public-content.ts`,
`apps/web/src/server/services/ai-retrieval.ts`.

## 6. Capture, Retry, and Compression Checkpoints

**Decision**: Submit normal opt-in capture to a registered pg-boss job with a
bounded idempotency digest. The provider queues post-turn work in a daemon
worker. For a supported, explicitly enabled strict checkpoint, the provider
submits capture then polls the job until the exact evidence revision is durable;
it raises on timeout/failure so Hermes can block lossy compression.

**Rationale**: Hermes says post-turn sync must be non-blocking, and the Wiki
constitution requires operations that can exceed a request budget to run as
jobs. The host can retry or resend overlapping transcript ranges, so a unique
destination/digest constraint and a committed record are required before
acknowledging a checkpoint.

**Alternatives considered**:

- Write all transcript data synchronously in `sync_turn`: rejected because it
  delays normal chats and violates the asynchronous heavy-work rule.
- Mark a checkpoint successful before the page revision exists: rejected because
  it permits lossy compression without preserved evidence.
- Store full tool messages by default: rejected for privacy; Hermes v2
  checkpoint inputs are normalized direct user/assistant evidence.

**Sources**: [checkpoint contract](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin), [MemoryProvider sync contract](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_provider.py).

## 7. Safe Configuration, Tools, and Diagnostics

**Decision**: Keep the setup wizard schema minimal: Wiki API base URL,
`NEXT_WIKI_MEMORY_API_KEY` secret, destination metadata supplied by the server,
and `capture_enabled=false`. Store non-secrets in a versioned file below the
provided `hermes_home`; Hermes writes the secret to its profile `.env`. Expose
uniquely prefixed search/save/forget tools and safe `status`/`check` commands.
A standalone bootstrap command supports prepare/validate and `--dry-run` before
the provider is active.

**Rationale**: Hermes configuration schemas send `secret: true` fields to `.env`.
Provider-specific CLI commands appear only after activation, so a standalone
helper is needed for pre-activation preparation. Unique tool names avoid core
tool shadowing and toolset gating is handled honestly.

**Alternatives considered**:

- Put the key in the JSON config or a command argument: rejected due to secret
  exposure and shell history.
- Put all advanced capture, timeout, and checkpoint options in the wizard:
  rejected because it makes first setup error-prone; document them in the
  versioned non-secret config instead.
- Return raw Wiki error bodies to diagnostics: rejected because they can expose
  protected content and implementation details.

**Sources**: [configuration schema guidance](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin), [tool injection/source collision behavior](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py).

## 8. In-Product Guidance and Public Delivery

**Decision**: Extend the existing optional sample-page writer with a managed
`help/hermes-memory` page, linked from marker-owned welcome and main-features
content. Add package and deployment documentation alongside a README cross-link.

**Rationale**: The current onboarding writer already creates published,
revisioned, cache-invalidated help pages idempotently and refuses collisions with
user-authored content. This gives a fresh personal Wiki owner a discoverable,
secure setup path without a new configuration screen or Docker dependency.

**Alternatives considered**:

- Documentation only in the repository: rejected because it is hard to discover
  from a newly initialized instance.
- Always overwrite `help/hermes-memory`: rejected because current setup protects
  user-authored help content.
- Add a dynamic public configuration dashboard: rejected because secrets and
  integration state must remain authenticated.

**Local evidence**: `apps/web/src/server/services/setup-sample-page-definitions.ts`,
`apps/web/src/server/services/setup-sample-pages.ts`, and
`apps/web/src/server/services/setup-sample-pages.test.ts`.

## 9. Validation and Release Strategy

**Decision**: Test contract behavior at the Wiki service, route/OpenAPI,
permission, audit, onboarding, Python unit/integration, Docker Compose, and
Hermes compatibility levels. Publish the wheel under a dedicated tag-triggered
workflow independent of the Node MCP package.

**Rationale**: Hermes's plugin API evolves rapidly and its dashboard/CLI schemas
are discovered separately. Fixture and real-host tests catch drift, while a
separate package release prevents Node MCP releases from unnecessarily changing
the Python provider.

**Alternatives considered**:

- Unit-test only the Python provider: rejected because destination authorization,
  page revision semantics, and revocation are Wiki-server responsibilities.
- Pin to a single Hermes version forever: rejected because users need a safe
  upgrade path and strict checkpoint availability is host-dependent.

**Sources**: [Hermes memory provider tests](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin), `packages/mcp-server/`, and `.github/workflows/publish-mcp-server.yml`.
