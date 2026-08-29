# Unified Agent Memory REST Contract

**Feature**: 040-openclaw-memory-integration
**Base path**: `/api/v1/memory`
**Consumers**: Hermes Memory, OpenClaw Memory Bridge, and future agent adapters

This contract extends the existing Agent Memory v1 API. It remains client-neutral:
the server stores no product name and does not authorize a request from an
agent-provided identity, namespace, destination, or grant identifier. Existing
Hermes requests retain their current meaning; all fields introduced here are
additive and optional where a legacy client must omit them.

All bearer-agent responses use `Cache-Control: private, no-store`. Validation,
scope, or authorization failures use the existing bounded error shape and do
not disclose another connection, destination, grant, title, query, excerpt, or
record count.

## Agent endpoints

### `GET /connection`

Resolves the credential on the server and returns a safe capability snapshot.
The existing `namespace` property remains for Hermes compatibility. A
connection-backed credential also receives an additive `connection` object;
legacy credentials receive `connection: null`.

```json
{
  "apiVersion": "v1",
  "namespace": { "id": "uuid", "displayName": "Agent memory" },
  "connection": {
    "id": "uuid",
    "state": "active",
    "agentIdentity": "assistant-ops"
  },
  "capabilities": {
    "recall": true,
    "save": true,
    "forget": true,
    "evidenceCapture": true,
    "grantedRecall": true
  },
  "limits": { "recallMaxResults": 10, "captureMaxBytes": 262144 }
}
```

It never returns grant inventory, shared destination labels, another agent's
identity, or credentials.

### `POST /recall`

```json
{
  "query": "What did we decide about the release checklist?",
  "limit": 5,
  "scope": "own_and_granted"
}
```

`scope` is one of `own`, `granted`, or `own_and_granted`; it defaults to `own`
so existing Hermes recall behaviour is unchanged. The server expands eligible
sources from the authenticated connection's private destination and active
owner-created read grants. It rechecks connection, destination, grant, and
record state immediately before serializing every result. `destinationId`,
`sourceConnectionId`, `grantId`, and arbitrary agent filters are rejected.

Each result contains only the entitled bounded excerpt and immutable citation:

```json
{
  "results": [{
    "memoryId": "uuid",
    "excerpt": "…",
    "citation": { "pageId": "uuid", "revisionId": "uuid", "revisionHash": "sha256:…" }
  }]
}
```

### `POST /records`

Creates an explicit private memory. The adapter supplies an idempotency key,
content permitted by its scope, and a closed `contentKind` (`original` or
`generated`) when applicable. The service determines the `recordType` and
closed origin from the accepted operation; a curated record is an owner-side
promotion, not an agent-selected content kind. The server selects the
authenticated connection's private namespace; shared target/destination fields
are not accepted. It writes canonical content through a restricted Raw page and
returns an immutable source revision citation plus the idempotency disposition.

Legacy Hermes save input remains valid and is interpreted with its existing
origin and normal content classification.

### `DELETE /records/{memoryId}`

Forgets a record visible to the resolved connection. This is a recall-state
projection change, not a hard deletion of the cited Raw source. It cannot be
used to target another connection's record.

### `POST /evidence`

Accepts a bounded eligible evidence payload using the existing idempotency,
session digest, checkpoint, and message fields. It adds an optional closed
`captureKind`: `turn`, `checkpoint`, `compaction`, or `session_end`. The server
persists canonical restricted evidence before returning `durable`; asynchronous
derivative work stores only a reference to that canonical source.

### `GET /evidence/{captureId}` and `GET /diagnostics`

Status and diagnostics are scoped to the resolved connection (or legacy
binding). They expose only safe lifecycle categories and citations after
durability; no transcript, prompt, query, title, session digest, raw payload,
or credential is returned.

## Owner-management endpoints

These endpoints are session-authenticated and owner-scoped. Agent bearer keys
cannot call them. They live under `/api/api-keys/agent-memory` and use the
project's normal management route conventions.

| Endpoint group | Purpose |
|---|---|
| `connections` | Create, inspect, disable, or revoke a stable agent-memory connection and issue/rotate its credential binding. |
| `connections/{connectionId}/read-grants` | Add, list, expire, or revoke a read grant from an owner-controlled shared namespace to a connection. |
| `promotions` | Copy selected private evidence into a separate owner-attributed curated record in a shared namespace, with immutable evidence links. |

An owner first creates a shared namespace/destination, then grants read access
to a connection. No agent endpoint creates a grant or writes directly to that
shared destination. Promotion is the deliberate write path. Disabling or
revoking a connection prevents future operations and pending capture delivery;
rotating a credential does not invalidate a still-active connection.

Per-destination retention endpoints are intentionally absent. Canonical Raw
content continues to use the Wiki's established retention policy, while
transient capture envelopes and adapter outbox files have bounded expiry.

## Schema and generated documentation gate

The implementation keeps runtime request/response Zod schemas in
`packages/shared/src/agent-memory.ts`, mirrors the necessary literal schemas in
`apps/web/src/server/api/openapi-schemas.ts`, and annotates the route handlers
with the framework's OpenAPI comments. Any API change must run:

```bash
pnpm --filter @next-wiki/web openapi:generate
```

The generated `apps/web/public/openapi.json` and the existing schema-sync test
are required review artifacts. Generated documentation, rather than a manually
maintained HTTP reference, is the published API source of truth.
