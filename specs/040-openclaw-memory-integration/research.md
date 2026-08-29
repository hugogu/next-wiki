# Research: Unified Agent Memory Integrations

**Feature**: [Unified Agent Memory Integrations](./spec.md)

## Decision 1: Extend one Agent Memory API; do not create an OpenClaw API version

**Decision**: Keep `/api/v1/memory/*` as the one public, product-neutral Agent
Memory interface. Extend it additively for stable connections, granted recall,
capture provenance, and capability discovery. Hermes and OpenClaw both call
this interface; neither receives a client-specific route family.

**Rationale**: 039 already provides a generic API with save, recall, evidence,
capture status, forget, connection, and diagnostics. OpenClaw needs additional
connection and sharing semantics, not a different content store or transport.
Keeping one path prevents backend behavior from diverging and lets an existing
Hermes client retain its default own-destination behavior. New optional fields
and routes are capability-discoverable; clients that do not need them ignore
them.

**Alternatives considered**:

- Create `/api/v2/memory/*` for OpenClaw: rejected because it duplicates the
  same domain surface and makes adapter choice part of server routing. A new
  major API is justified only by a breaking public semantic change, not by the
  arrival of another adapter.
- Let OpenClaw call generic page APIs: rejected because page scopes cannot
  safely select an Agent Memory destination or prevent a client from choosing a
  path.
- Make Hermes call an OpenClaw-shaped endpoint: rejected because the server
  contract must stay product-neutral and Hermes has different lifecycle
  behavior.

## Decision 2: Separate stable connections from rotatable credentials

**Decision**: Add a generic `agent_memory_connections` entity. Evolve the
existing `agent_memory_key_bindings` row into a credential-to-connection link
while preserving its legacy namespace/identity fields for existing Hermes
bindings.

**Rationale**: In 039, an API key is the practical identity. Rotating it makes
an agent look new and makes pending delivery, grants, audit attribution, and
record provenance depend on a credential that is expected to change. A
connection is the durable owner-authorized identity; a credential only
authenticates that connection. The server therefore never trusts hook fields,
agent names, paths, or destination values supplied by either adapter.

**Compatibility**: No historical backfill is required. Existing Hermes keys
continue through the legacy binding resolver. New connections and newly issued
credentials set `connection_id`; owner tooling can later attach or replace a
legacy credential deliberately.

## Decision 3: Use the existing namespace table as the destination table

**Decision**: Keep `agent_memory_namespaces` as the physical table and use it
as the logical Memory Destination. Add a closed `private/shared` role; do not
create `agent_memory_destinations`.

**Rationale**: The 039 namespace already owns the collection, state, owner,
record relationships, and key binding. Its role is a semantic extension, not a
new aggregate. A connection owns one private destination. A shared destination
is owner-controlled and is never chosen by an adapter request.

## Decision 4: Model cross-agent retrieval as explicit read grants

**Decision**: Add `agent_memory_destination_grants` for owner-created,
revocable, expiring read grants from a connection to a shared destination.
Normal agent writes and captures always use the caller's private destination.
Shared knowledge is created by an owner-side curation/promotion action, not by
an adapter choosing a shared destination.

**Rationale**: The 039 `shared_by_owner` flag and shared namespace bindings
cannot express “B may read this destination but may not write it”, expiry, or
per-grantee revocation. Keeping agent writes private removes ambiguous target
selection and prevents automatic capture from becoming publication. The owner
can create an attributable curated copy, then grant selected connections read
access.

**Alternatives considered**:

- Reuse `shared_by_owner` as an access grant: rejected; it is an audit/UI
  marker, not an access-control list.
- Accept a destination ID in recall or save: rejected; a compromised adapter
  could enumerate or write arbitrary destinations.
- Add generic shared writes now: deferred. Without a server-selected write
  target it conflicts with the no-client-selected-destination invariant.

## Decision 5: Preserve canonical content in Raw revisions; bound transient data

**Decision**: Continue to write every durable record through the restricted Raw
writer and retain only locators, provenance, authorization state, and
idempotency projections in Agent Memory tables. Add an encrypted,
time-limited capture envelope to the existing capture row; pg-boss receives a
capture identifier only. The OpenClaw bridge owns a bounded local outbox.

**Rationale**: Hermes checkpoints and OpenClaw lifecycle capture both need an
idempotent durable outcome. Raw pages and immutable revisions provide the one
canonical body and citation. The capture row can retain temporary encrypted
input until the worker writes that source, then delete it. This protects
privacy, supports restart, and avoids a second transcript store.

**Retention boundary**: This feature requires TTL/capacity limits for
transient envelopes and local outbox entries. It does not add a
per-destination long-term retention-policy table. Canonical source retention
continues to use the Wiki's existing Raw-content policy.

## Decision 6: Keep adapter behavior out of the server

**Decision**: Retain the Hermes Python provider as an optional adapter and ship
OpenClaw as a separately installable, ESM, non-capability plugin. The bridge
uses documented hooks, optional tools, a service-owned local outbox, and—only
when explicitly enabled—authorized prompt enrichment. It does not claim the
exclusive OpenClaw memory slot or call another memory plugin's private API.

**Rationale**: Hermes has native provider setup and strict checkpoint behavior;
OpenClaw has Gateway hooks, explicit prompt/tool permissions, and a local
memory system that must remain independent. Those differences belong in the
adapters. OpenClaw documents hook-only and non-capability plugins as supported,
and advises external plugins to use narrow documented surfaces rather than
private reach-ins. See [building plugins](https://docs.openclaw.ai/plugins/building-plugins),
[plugin architecture](https://github.com/openclaw/openclaw/blob/main/docs/plugins/architecture.md),
and [plugin hooks](https://docs.openclaw.ai/plugins/hooks).

## Decision 7: Treat compaction hooks as observations, not durability gates

**Decision**: On an OpenClaw lifecycle event, synchronously persist only the
local outbox intent. Delivery happens asynchronously. `before_compaction` can
report pending protection but cannot promise a remote durable write or veto
compaction unless OpenClaw later provides a documented capability for that
behavior.

**Rationale**: External hook callbacks are at-least-once, concurrent, and may
be interrupted at shutdown. Server idempotency plus a restart-safe outbox is
the delivery boundary. Hermes strict checkpoints remain adapter-specific: they
may wait for the common capture-status result when the Hermes runtime supports
that contract.

## Decision 8: API documentation is generated from the implementation contract

**Decision**: Runtime Zod schemas remain in `packages/shared`. Literal Zod
schemas in `apps/web/src/server/api/openapi-schemas.ts` mirror them because the
current OpenAPI scanner cannot follow workspace aliases; structural tests guard
that mirror. Route annotations reference those schemas. Every API change runs
the existing OpenAPI generator and commits the regenerated document.

**Rationale**: The public API is an integration boundary. Manually edited JSON
or prose cannot remain authoritative. The existing generator and sync tests
are the project mechanism for detecting drift.

## Decision 9: Publish generic and OpenClaw guides safely

**Decision**: Keep generic Agent Memory guidance product-neutral and add one
managed OpenClaw bridge guide. Both are marker-owned published pages with
placeholder configuration only. Add page/help-navigation cache tags and
invalidate them only after a successful guide mutation.

**Rationale**: Operators need installation and recovery guidance, but endpoint
values, connection IDs, agent labels, grants, and credentials are private.
Targeted invalidation satisfies the public static-delivery rule without
invalidating unrelated pages.
