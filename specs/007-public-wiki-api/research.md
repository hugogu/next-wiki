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
