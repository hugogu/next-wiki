# Agent Memory REST Contract

**Status**: Planned public v1 contract
**Feature**: [Agent Memory Provider](../spec.md)
**Base URL**: `{NEXT_WIKI_API_URL}` (for example `https://wiki.example.com/api/v1`)

## Contract Principles

- Every endpoint uses `Authorization: Bearer {NEXT_WIKI_MEMORY_API_KEY}`. Query
  parameters, JSON bodies, and logs never carry credentials.
- The server resolves the Memory Destination from the authenticated API key's
  binding. No request field, URL path, tool argument, or client header may select
  an owner, Hermes profile, namespace, page path, or arbitrary destination.
- Dedicated `memory.*` scopes authorize this surface. Generic page scopes and
  broad Raw/Generated `spaceAccess` do not substitute for them.
- Responses contain only the caller's bound destination and bounded content.
  A memory ID owned by another destination is indistinguishable from not found.
- Routes use the existing public API wrapper, shared Zod schemas, audit wrapper,
  and generated OpenAPI document. Responses are never cached.
- Memory writes require the shared Raw space to be available (currently the
  instance's LLM Wiki writing mode). Raw availability failures use the safe
  namespace-unavailable response with an actionable setup message.
- All timestamps are ISO 8601 UTC strings. All identifiers are UUIDs unless a
  field is explicitly called a digest or an idempotency key.

## Shared Types

### Citation

```json
{
  "pageId": "0f2d7a30-6f6e-4d49-84e4-34d6543c61f9",
  "revisionId": "0bfa9d6f-6b2e-4072-a5e8-13d2b8317d0c",
  "revisionHash": "sha256-hex",
  "title": "Payment routing decision",
  "canonicalUrl": "https://wiki.example.com/raw/9b4d5b2e5b9e4f5c8a5e1b2c3d4e5f6a",
  "createdAt": "2026-08-27T08:30:00.000Z"
}
```

`canonicalUrl` is a durable Wiki reader address. The service must not return
unpublished/public URLs for an inaccessible record; a restricted page's address
is returned only to the bound memory key in the memory response.

### Memory Record View

```json
{
  "memoryId": "d81b14aa-dadb-4f4c-98f0-801a9efc2ce6",
  "type": "memory",
  "state": "active",
  "title": "Payment routing decision",
  "excerpt": "Use an idempotency key for every provider submission...",
  "citation": { "$ref": "Citation" },
  "evidence": [
    {
      "evidenceId": "c9d04a34-4f32-4bbd-87f9-6d2c6d33e2ca",
      "relation": "explicit_save",
      "citation": { "$ref": "Citation" }
    }
  ]
}
```

`excerpt` is length-capped by the server. The response never includes full raw
conversation evidence unless a future, separately authorized read contract is
specified.

### Error Body

```json
{
  "error": {
    "code": "AGENT_MEMORY_NAMESPACE_UNAVAILABLE",
    "message": "The memory destination is unavailable. Check the key binding or ask the Wiki owner to enable it."
  }
}
```

All error messages are bounded repair guidance. They must not include API keys,
request bodies, page titles/paths outside the binding, upstream response bodies,
database errors, or raw stack traces.

| Code | HTTP | Meaning |
|---|---:|---|
| `UNAUTHORIZED` | 401 | Missing, malformed, invalid, revoked, or disabled API key. Provider diagnostics may distinguish safe configured states where auth resolution can do so without revealing a key. |
| `AGENT_MEMORY_SCOPE_REQUIRED` | 403 | Key lacks the endpoint's dedicated memory scope. |
| `AGENT_MEMORY_KEY_UNBOUND` | 403 | Authenticated key has no active Memory Destination binding. |
| `AGENT_MEMORY_NAMESPACE_UNAVAILABLE` | 403 | Bound destination is disabled or no longer valid. |
| `AGENT_MEMORY_RECORD_NOT_FOUND` | 404 | Memory is absent, forgotten, or belongs to another destination. |
| `AGENT_MEMORY_EVIDENCE_INVALID` | 422 | Evidence roles, length, digest, or content policy fail validation. |
| `AGENT_MEMORY_CHECKPOINT_NOT_DURABLE` | 409 | A strict checkpoint is not yet durable, failed, or was cancelled. |
| `AGENT_MEMORY_INCOMPATIBLE_CLIENT` | 426 | Provider/client contract version is unsupported; response identifies supported versions only. |
| `RATE_LIMITED` | 429 | Existing rate/abuse policy declined the request. |

## `GET /memory/connection`

Returns a non-secret, content-free connection profile for setup/status checks.

**Authorization**: `memory.read` or `memory.write`; a setup key that has both
is the documented default.

**Request headers**:

| Header | Required | Purpose |
|---|---|---|
| `Authorization` | Yes | Dedicated memory-provider Bearer API key. |
| `X-Next-Wiki-Memory-Provider-Version` | Yes | Bounded provider release version for compatibility diagnostics. |

**200 response**:

```json
{
  "apiVersion": "v1",
  "provider": "next-wiki",
  "namespace": {
    "id": "d0f90a69-997b-4dee-9e91-c61c68dfc604",
    "displayName": "Hermes — default profile",
    "state": "active",
    "agentIdentity": "hermes"
  },
  "capabilities": {
    "recall": true,
    "save": true,
    "forget": true,
    "asynchronousEvidenceCapture": true,
    "strictCheckpoint": true,
    "semanticRecall": false
  },
  "limits": {
    "maxRecallResults": 10,
    "maxSaveCharacters": 16000,
    "maxEvidenceCharacters": 64000,
    "maxEvidenceMessages": 100
  }
}
```

The server derives each Boolean from the bound key scope, destination state, and
server version. It must not use the presence of a Wiki model provider as a
connection prerequisite.

## `GET /memory/diagnostics`

Returns a credential-safe diagnostic outcome. It is for `hermes next-wiki check`
and the standalone setup helper; it does not return memory content.

**Authorization**: Any dedicated `memory.*` scope.

**200 response**:

```json
{
  "status": "healthy",
  "apiVersion": "v1",
  "namespaceState": "active",
  "grantedScopes": ["memory.read", "memory.write", "memory.delete"],
  "lastSafeOutcome": {
    "operation": "recall",
    "at": "2026-08-27T08:40:00.000Z",
    "status": "succeeded"
  }
}
```

`status` is one of `healthy`, `incomplete`, `forbidden`, `unavailable`, or
`incompatible`. Only a safe outcome category is retained; no content or
provider-supplied profile value is echoed.

## `POST /memory/recall`

Performs bounded, namespace-filtered lexical recall over active explicit memory
and durable conversation-evidence records. It is synchronous only within the
defined immediate database budget; an unavailable derived index is a safe
non-success outcome, not a fallback to unrestricted page search. Evidence is
already canonical Raw content, so no separate synthesis step is required for
it to become searchable after the capture reaches `durable`.

**Authorization**: `memory.read`.

**Request**:

```json
{
  "query": "What did we decide about payment provider retries?",
  "limit": 5
}
```

| Field | Rules |
|---|---|
| `query` | Required normalized text, 1–4,000 characters; not stored in audit metadata. |
| `limit` | Optional integer 1–10; default comes from destination/provider configuration, capped by server policy. |

**200 response**:

```json
{
  "results": [{ "$ref": "Memory Record View" }],
  "retrieval": {
    "mode": "lexical",
    "complete": true,
    "returned": 1
  }
}
```

An empty `results` array with `complete=true` means no relevant permitted
memory or durable evidence. It must not be confused with authentication,
destination, or index failure. Queued/running captures are not returned until
their Evidence Record is durable. Results identify their source with `type:
"memory"` or `type: "evidence"`; evidence remains immutable and is not
forgettable through the memory-record DELETE operation.

## `POST /memory/records`

Creates an explicit durable memory in the bound destination. The service
appends one restricted, published Raw entry through the shared Raw writer,
preserves the submitted source verbatim, invokes the common content/index
reconciliation path, and records any declared evidence links. A retry with the
same idempotency key returns the existing entry; it never edits or creates a
second revision for that key.

**Authorization**: `memory.write`.

**Request**:

```json
{
  "idempotencyKey": "7ce11a61-4a23-48aa-a62c-cb2f4a38fd6b",
  "content": "Always use an idempotency key when submitting payment changes.",
  "title": "Payment provider retry decision",
  "tags": ["payments", "decision"],
  "evidenceIds": ["c9d04a34-4f32-4bbd-87f9-6d2c6d33e2ca"]
}
```

| Field | Rules |
|---|---|
| `idempotencyKey` | Required UUID or bounded digest; unique within bound destination. Identical retries return the existing result. |
| `content` | Required 1–16,000 characters; becomes canonical page source through normal revision services. |
| `title` | Optional 1–160 characters; server applies a safe default if omitted. |
| `tags` | Optional 0–10 normalized labels; no arbitrary metadata passthrough. |
| `evidenceIds` | Optional 0–20 UUIDs; each must be an active Evidence Record in the same destination or the request fails atomically. |

**201 / idempotent 200 response**:

```json
{
  "record": { "$ref": "Memory Record View" },
  "idempotent": false
}
```

An existing idempotency key with semantically different normalized payload is a
`409` safe conflict. The service must not silently overwrite an earlier memory.

## `DELETE /memory/records/{memoryId}`

Marks one active memory forgotten in the Agent Memory projection. The immutable Raw
page/revision is retained unchanged; only Hermes recall eligibility changes.

**Authorization**: `memory.delete`.

**Request** (optional):

```json
{ "reason": "Superseded policy" }
```

`reason` is bounded to 500 characters and may appear only as safe audit
metadata. It is never written into a source transcript or public page.

**200 response**:

```json
{
  "memoryId": "d81b14aa-dadb-4f4c-98f0-801a9efc2ce6",
  "state": "forgotten",
  "forgottenAt": "2026-08-27T08:50:00.000Z"
}
```

Repeating a successful forget returns the same forgotten state. A memory from a
different destination returns `AGENT_MEMORY_RECORD_NOT_FOUND`.

## `POST /memory/evidence`

Submits opted-in, normalized conversation evidence for asynchronous durable
capture. It never accepts tool result content by default.

**Authorization**: `memory.write`.

**Request**:

```json
{
  "idempotencyKey": "edfd18ce-842a-4961-8d2d-ee43faacfb97",
  "sessionDigest": "sha256-hex",
  "checkpoint": false,
  "messages": [
    { "role": "user", "content": "We chose the retry policy." },
    { "role": "assistant", "content": "I will store the documented decision." }
  ]
}
```

| Field | Rules |
|---|---|
| `idempotencyKey` | Required, destination-scoped unique key/digest. |
| `sessionDigest` | Required one-way digest, 32–128 lower-case hex characters; raw session ID is never persisted. |
| `checkpoint` | Required Boolean. `true` means the client will wait for a durable acknowledgement. |
| `messages` | Required 1–100 direct `user`/`assistant` rows; each and the total must fit the server size limits. System rows, tool calls, tool outputs, arbitrary metadata, and nested payloads are rejected. |

**202 response**:

```json
{
  "captureId": "5ce11a61-4a23-48aa-a62c-cb2f4a38fd6b",
  "status": "queued",
  "pollUrl": "/api/v1/memory/evidence/5ce11a61-4a23-48aa-a62c-cb2f4a38fd6b",
  "idempotent": false
}
```

`pollUrl` is an origin-relative API path beginning with `/api/v1`. Resolve it
against the origin of the configured `{NEXT_WIKI_API_URL}`; do not append it to
the already-versioned base URL. Repeated requests return the same
`captureId` and latest state. The route queues
work but does not claim durable preservation.

## `GET /memory/evidence/{captureId}`

Returns a bounded capture status used by the provider's retry worker and strict
checkpoint wait loop.

**Authorization**: `memory.write`.

**200 response while pending**:

```json
{
  "captureId": "5ce11a61-4a23-48aa-a62c-cb2f4a38fd6b",
  "status": "running",
  "durable": false
}
```

**200 response when durable**:

```json
{
  "captureId": "5ce11a61-4a23-48aa-a62c-cb2f4a38fd6b",
  "status": "durable",
  "durable": true,
  "evidence": {
    "evidenceId": "c9d04a34-4f32-4bbd-87f9-6d2c6d33e2ca",
    "citation": { "$ref": "Citation" }
  }
}
```

`failed` and `cancelled` states return only safe code/message fields. A Hermes
strict checkpoint succeeds only for `durable=true`; it raises on every other
terminal state or timeout.

## Client Provider Contract (Hermes first)

The Python distribution exposes the provider name `next-wiki` and these unique
OpenAI-function schemas:

| Tool | Server call | Input boundary |
|---|---|---|
| `next_wiki_memory_search` | `POST /memory/recall` | `query`, optional bounded `limit`; no profile/destination/API URL fields. |
| `next_wiki_memory_save` | `POST /memory/records` | bounded `content`, optional `title`/`tags`; provider supplies idempotency key. |
| `next_wiki_memory_forget` | `DELETE /memory/records/{memoryId}` | only bound-destination memory ID and optional bounded reason. |

The provider must validate tool input before transport, return a safe JSON string
for every outcome, and distinguish empty recall, unavailable service,
unauthorized, forbidden, invalid request, and not-found. Hermes may suppress all
provider tools when the `memory` toolset is disabled; the provider status output
must explain that condition rather than claiming tools are usable.

## Provider Configuration and Commands

### `hermes memory setup` fields

| Field | Secret | Default | Storage |
|---|---:|---|---|
| `wiki_api_base_url` | No | none | `$HERMES_HOME/next-wiki.json` |
| `api_key` / `NEXT_WIKI_MEMORY_API_KEY` | Yes | none | Hermes profile `.env` |
| `agent_identity` | No | `hermes` | `$HERMES_HOME/next-wiki.json` |
| `capture_enabled` | No | `false` | `$HERMES_HOME/next-wiki.json` |

Destination identity is returned by `GET /connection` after a dedicated API key
has been created in next-wiki; it is not a free-form security selector in the
setup wizard. Advanced non-secret limits, retry, optional shared-key decision,
and checkpoint settings use a versioned JSON config and are documented, not
prompted in the default wizard.

### Commands

| Command | Availability | Effect |
|---|---|---|
| `hermes-memory-provider init [--wiki-url URL] [--dry-run]` | After package install, before activation | Validates non-secret address, safely prompts/reads secret through non-argument input, prepares Hermes-compatible config only after confirmation, and may call diagnostics. |
| `hermes memory setup` | Hermes normal flow | Selects `next-wiki`, stores secret through Hermes, and activates the provider. |
| `hermes next-wiki status` | Active provider only | Prints URL, destination label, configuration version, capture preference, and whether a secret is set; performs no network call. |
| `hermes next-wiki check` | Active provider only | Performs bounded connection/scope/compatibility probe and prints only safe repair guidance. |

No command accepts a literal API key as a positional or option value. `--dry-run`
must write nothing and must not activate a provider.
