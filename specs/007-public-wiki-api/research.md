# Research: Public Wiki Content API

## R1 — Public Contract Shape

**Decision**: Introduce `/api/v1` as the stable public content API namespace,
covering pages, revisions, publication, assets, and page search.

**Rationale**: The architecture mandate already reserves `/api/v1` for frozen
public contracts. Current unversioned routes are useful internally but have
mixed frontend-oriented shapes and can evolve without a public compatibility
burden. A versioned namespace gives OpenClaw, OpenCode, and scripts a durable
target.

**Alternatives considered**:
- Reuse current unversioned routes directly: rejected because their resource
  shapes and paths were not designed as long-term public contracts.
- Version only the OpenAPI document but keep paths unversioned: rejected because
  breaking path changes would still affect external clients.

## R2 — API Layer Ownership

**Decision**: Public route handlers are contract adapters over shared services
and shared validation. They must not make nested HTTP calls to internal route
handlers and must not contain unique page, revision, asset, publish, search, or
permission business logic.

**Rationale**: The constitution requires business logic in the service layer.
Calling internal HTTP routes would add latency, complicate audit context, and
hide permission behavior behind another adapter. Direct service calls keep one
permission and mutation path for browser, external API, and future MCP.

**Alternatives considered**:
- Implement `/api/v1` by forwarding HTTP requests to existing `/api/*` routes:
  rejected because route handlers are adapters, not service APIs.
- Duplicate logic in public route handlers for stable behavior: rejected
  because it creates drift from browser behavior and violates the architecture
  mandate.

## R3 — First-Party Frontend Usage

**Decision**: Client-side first-party CRUD workflows should use `/api/v1` when a
matching public content operation exists. Server-rendered loaders may continue
calling services directly when no client-side round trip is needed.

**Rationale**: Client reuse of the public contract proves the external API stays
aligned with browser behavior. Server Components already operate inside the
server boundary and can avoid unnecessary HTTP calls while still using the same
services.

**Alternatives considered**:
- Force all frontend code, including Server Components, through HTTP: rejected
  because it adds avoidable internal network hops and conflicts with existing
  RSC service-loader rules.
- Leave frontend on unversioned internal routes forever: rejected because it
  allows public and browser behavior to drift.

## R4 — API Key Scope Strategy

**Decision**: Reuse existing API key scopes for this stage:
`view` for read/search/history/source, `create` for page creation and asset
upload, `edit` for draft creation, property updates, and publish, and `delete`
for delete/restore only if those public operations are included later.

**Rationale**: The current permission model already intersects API key scopes
with the owning user's role. The feature goal is stable wiki content automation,
not new identity or AI scopes.

**Alternatives considered**:
- Add `content` or `wiki` scopes: rejected for this feature because existing
  scopes map cleanly to the requested operations.
- Add `mcp` or `ai` scopes now: rejected because MCP and AI governance are
  explicitly out of scope.

## R5 — Stale Update Protection

**Decision**: Public update and publish workflows should expose revision
identity and support stale-update conflicts. Updating an existing page through
the public API should accept a base revision identity from the client and return
a conflict when the page has changed since that base.

**Rationale**: External tools often operate from cached page reads. Without a
stale guard, an automated writer can unknowingly overwrite a browser user's
newer draft. The existing browser behavior can remain last-write-wins until it
migrates, but the public API should provide a safer automation contract.

**Alternatives considered**:
- Keep last-write-wins for public automation: rejected because external tools
  are more likely to run unattended and need deterministic conflict signals.
- Require full merge resolution now: rejected as outside this feature's scope.

## R6 — Asset Contract

**Decision**: Public asset upload returns stable metadata plus a Markdown-usable
reference. Asset content is served through a public content endpoint that
enforces the same visibility rules as existing asset reads.

**Rationale**: Automation needs both an identifier and an insertion string. The
existing content asset service already validates image bytes, tracks references,
and enforces page-equivalent read permissions.

**Alternatives considered**:
- Let tools upload arbitrary file types immediately: rejected because current
  storage and rendering guarantees are image-oriented.
- Return only raw asset ids: rejected because clients then need undocumented URL
  construction knowledge.

## R7 — Search Baseline

**Decision**: Provide page search suitable for automation using the existing
readable page corpus and permission filtering. Semantic search can be linked or
added later, but it is not required for the baseline public API.

**Rationale**: Wiki.js replacement requires reliable content discovery by path,
title, and text terms. The current AI semantic search depends on optional AI
configuration and should not be mandatory for the baseline.

**Alternatives considered**:
- Make semantic search the public search API: rejected because AI may be
  disabled and the feature must work without AI.
- Omit search until full-text infrastructure is expanded: rejected because
  external tools need a basic discovery workflow.

## R8 — MCP Server Package Placement

**Decision**: Place the MCP Server in the existing monorepo as
`packages/mcp-server/` (`@next-wiki/mcp-server`), not in a separate repository.

**Rationale**:
- The MCP Server is a thin client of the v1 REST API and shares types from
  `@next-wiki/shared`. A separate repo would duplicate type definitions or
  require cross-repo package versioning for no architectural benefit.
- The pnpm workspace + Turborepo monorepo already supports multi-package
  builds, shared typechecking, and unified CI. Adding one more package is
  zero-friction.
- The MCP Server is a publishable npm package (users install and run it locally
  via `npx @next-wiki/mcp-server`), which fits `packages/` semantics better
  than `apps/` (deployable web services).
- Single repo means contract changes (new v1 endpoint, schema update) and MCP
  tool updates land in the same PR, preventing drift.

**Alternatives considered**:
- Separate repository: rejected because the MCP Server has no independent
  release cadence, no separate team, and depends on shared types from this
  repo.
- `apps/mcp-server/`: rejected because MCP servers are package/CLI tools, not
  web applications with their own deployment. The HTTP/SSE transport variant
  can later be mounted inside `apps/web` at `/api/mcp` without a separate app.

## R9 — MCP Transport and Authentication Model

**Decision**: The MCP Server uses stdio as the primary transport and holds the
API key internally. AI clients (Claude Desktop, Cursor) never see or manage
bearer tokens.

**Rationale**:
- stdio is the universal MCP transport supported by all major AI clients
  (Claude Desktop, Cursor, Windsurf). It requires zero network configuration
  from the user — just a config entry pointing to the server binary.
- Embedding the API key in the MCP Server process (via `NEXT_WIKI_API_KEY`
  environment variable or `--api-key` flag) removes the most error-prone step
  for AI agents: HTTP auth header construction. The AI interacts with typed
  tool parameters only.
- All permission enforcement remains server-side in the v1 REST API. The MCP
  Server is a pure passthrough — it does not re-implement any permission logic.
  A Reader-scoped key in the MCP config means all write tools will return
  permission errors from the server, identical to a direct REST call.
- HTTP/SSE transport is documented as a SHOULD (FR-026) for future remote
  deployment but is not required for the initial release.

**Alternatives considered**:
- Have the AI client pass the API key as a tool parameter: rejected because it
  leaks secrets into prompt context and LLM token streams.
- Implement OAuth in the MCP Server: rejected as over-engineering for the
  current scale; API key is already the established auth model.
- HTTP-only (no stdio): rejected because it breaks Claude Desktop and Cursor
  local workflows, which expect stdio.

## R10 — MCP Tool Design Principles

**Decision**: Each MCP tool maps 1:1 to a v1 REST endpoint. Tool names use
`snake_case` action verbs. Response shapes are flattened and de-HTTP-ified.

**Rationale**:
- 1:1 mapping keeps the MCP Server maintainable — when a REST endpoint changes,
  exactly one tool updates. No tool composition logic to drift.
- LLMs select tools by name and description. Clear names like `search_wiki`,
  `create_page`, `upload_image` outperform generic names like `execute_api`.
- Raw HTTP response envelopes (`{ items: [...], nextCursor: "..." }`) waste
  tokens and confuse LLMs. Flattening to `{ results: [...], has_more: true }`
  with plain-language field names improves comprehension.
- The `upload_image` tool is especially important: LLMs cannot construct
  multipart form data. The MCP tool accepts image bytes as a base64 parameter
  and handles the multipart encoding internally.

**Alternatives considered**:
- Composite tools (e.g., `create_and_publish_page`): rejected for the initial
  release to keep the surface minimal and avoid duplicating workflow logic.
  Composite workflows can be layered later as higher-level tools.
- Expose raw REST passthrough as a single generic tool: rejected because it
  defeats the purpose of MCP — AI would still need to construct URLs and HTTP
  methods.
